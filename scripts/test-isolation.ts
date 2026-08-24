/**
 * Preuve concrète de l'isolation entre organisations — par des requêtes
 * contre la vraie base, pas en relisant le code.
 *
 * Autonome et réversible : crée deux organisations JETABLES (_iso-a, _iso-b),
 * chacune avec son admin, un contact, une affaire (passée d'étape), un
 * partenaire, un partage, deux tâches (une achevée) et une interaction.
 * Vérifie ensuite que l'admin de l'une n'obtient RIEN de l'autre par les
 * mêmes fonctions que les écrans (lectures, journal unifié, écritures), puis
 * que la base ELLE-MÊME refuse une ligne qui mélangerait deux organisations
 * (FK composites). Enfin supprime tout et vérifie qu'il ne reste rien.
 * Ne touche à aucune organisation existante.
 *
 * Usage : npm run db:test-isolation
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const SLUGS = ["_iso-a", "_iso-b"] as const;

let failures = 0;
function ok(label: string) {
  console.log(`  ✓ ${label}`);
}
function ko(label: string, detail?: unknown) {
  failures += 1;
  console.error(`  ✗ ${label}${detail ? ` — ${String(detail)}` : ""}`);
}
async function expectThrow(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    ko(label, "aucune erreur levée");
  } catch {
    ok(label);
  }
}
function expect(label: string, condition: boolean, detail?: unknown) {
  if (condition) ok(label);
  else ko(label, detail);
}

async function main() {
  const { db } = await import("../src/db");
  const schema = await import("../src/db/schema");
  const { and, count, eq, inArray } = await import("drizzle-orm");
  const { seedDefaultDealStatuses } = await import("../src/db/queries/deal-statuses");
  const { getVisibleOrganizations } = await import("../src/db/queries/organizations");
  const contactsQ = await import("../src/db/queries/contacts");
  const dealsQ = await import("../src/db/queries/deals");
  const sharesQ = await import("../src/db/queries/deal-shares");
  const tasksQ = await import("../src/db/queries/tasks");
  const activitiesQ = await import("../src/db/queries/activities");
  const { createPartner } = await import("../src/db/queries/partners");
  const { getFollowUpBoard } = await import("../src/db/queries/deal-follow-up");
  const { organizations, users, contacts, deals, tasks, activities, dealEvents, dealStageChanges, dealShares, dealTypes, dealStatuses, contactAccessLog } = schema;

  // Jamais deux passages simultanés, et jamais de reliquat d'un passage interrompu.
  const leftovers = await db.select({ id: organizations.id }).from(organizations).where(inArray(organizations.slug, [...SLUGS]));
  if (leftovers.length > 0) {
    console.log("Reliquats d'un passage précédent : suppression avant de commencer.");
    await db.delete(organizations).where(inArray(organizations.slug, [...SLUGS]));
  }

  type Fixture = {
    orgId: string;
    admin: { role: "admin"; organizationId: string };
    userId: string;
    contactId: string;
    dealId: string;
    pipelineId: string;
    statuses: (typeof dealStatuses.$inferSelect)[];
    partnerId: string;
    shareId: string;
    openTaskId: string;
    doneTaskId: string;
    activityId: string;
  };

  async function build(slug: string, label: string): Promise<Fixture> {
    const [org] = await db.insert(organizations).values({ name: `Isolation ${label}`, slug }).returning();
    const [user] = await db
      .insert(users)
      .values({ email: `admin@${slug}.invalid`, name: `Admin ${label}`, role: "admin", organizationId: org.id })
      .returning();
    const admin = { role: "admin" as const, organizationId: org.id };
    await seedDefaultDealStatuses(org.id);
    const statuses = await db.select().from(dealStatuses).where(eq(dealStatuses.organizationId, org.id)).orderBy(dealStatuses.position);
    const [type] = await db.insert(dealTypes).values({ organizationId: org.id, slug: "credit", label: "Crédit" }).returning();

    const contact = await contactsQ.createContact(admin, user.id, {
      kind: "person",
      name: `Client ${label}`,
      email: `client@${slug}.invalid`,
      phone: "0600000000",
    });
    const deal = await dealsQ.createDeal(admin, user.id, {
      title: `Dossier ${label}`,
      clientName: "",
      typeId: type.id,
      contactId: contact.id,
    });
    await dealsQ.changeDealStage(admin, user.id, deal.id, statuses[1].id);
    const partner = await createPartner(admin, { name: `Confrère ${label}` });
    const { share } = await sharesQ.createDealShare(admin, user.id, { dealId: deal.id, partnerId: partner.id });
    const openTask = await tasksQ.createTask(admin, user.id, { title: `Rappeler ${label}`, dueDate: "2026-01-05", contactId: contact.id, dealId: deal.id });
    const doneTask = await tasksQ.createTask(admin, user.id, { title: `Préparer ${label}`, contactId: contact.id });
    await tasksQ.completeTask(admin, doneTask.id, user.id);
    const activity = await activitiesQ.createActivity(admin, user.id, { type: "call", content: `Appel ${label}`, dealId: deal.id });

    return {
      orgId: org.id,
      admin,
      userId: user.id,
      contactId: contact.id,
      dealId: deal.id,
      pipelineId: statuses[0].pipelineId,
      statuses,
      partnerId: partner.id,
      shareId: share.id,
      openTaskId: openTask.id,
      doneTaskId: doneTask.id,
      activityId: activity.id,
    };
  }

  let a: Fixture | null = null;
  let b: Fixture | null = null;
  try {
    console.log("\n--- Décor : deux organisations jetables, chacune avec son jeu complet");
    a = await build(SLUGS[0], "A");
    b = await build(SLUGS[1], "B");
    ok(`créées : ${SLUGS.join(", ")}`);

    console.log("\n--- Lectures : B n'obtient rien de A par les fonctions des écrans");
    const visibleByA = await getVisibleOrganizations(a.admin);
    expect("getVisibleOrganizations(A) = [A] seulement", visibleByA.length === 1 && visibleByA[0].id === a.orgId);
    const visibleBySuper = await getVisibleOrganizations({ role: "super_admin", organizationId: null });
    expect("super admin voit A et B", visibleBySuper.some((o) => o.id === a!.orgId) && visibleBySuper.some((o) => o.id === b!.orgId));

    const listB = await contactsQ.listContacts(b.admin, {});
    expect("listContacts(B) ne contient pas le contact de A", !listB.rows.some((c) => c.id === a!.contactId) && listB.rows.some((c) => c.id === b!.contactId));
    const searchB = await contactsQ.listContacts(b.admin, { q: "Client A" });
    expect("recherche « Client A » depuis B : zéro résultat", searchB.total === 0);
    await expectThrow("getContact(B, contact de A) refuse", () => contactsQ.getContact(b!.admin, a!.contactId));
    await expectThrow("getContactPageData(B, contact de A) refuse", () => contactsQ.getContactPageData(b!.admin, a!.contactId));
    await expectThrow("exportContactData(B, contact de A) refuse", () => contactsQ.exportContactData(b!.admin, a!.contactId, b!.userId));
    const [foreignAccess] = await db
      .select({ n: count() })
      .from(contactAccessLog)
      .where(and(eq(contactAccessLog.contactId, a.contactId), eq(contactAccessLog.userId, b.userId)));
    expect("aucune ligne de journal des accès écrite pour B sur la fiche de A", foreignAccess.n === 0);

    await expectThrow("getDeal(B, affaire de A) refuse", () => dealsQ.getDeal(b!.admin, a!.dealId));
    const boardB = await dealsQ.listDealsBoard(b.admin, a.pipelineId);
    expect("kanban de B sur le pipeline de A : vide", boardB.length === 0);
    const tableB = await dealsQ.listDealsTable(b.admin, { pipelineId: a.pipelineId });
    expect("liste de B sur le pipeline de A : total 0", tableB.total === 0);
    const summaryB = await dealsQ.getPipelineSummary(b.admin);
    expect("résumé pipeline de B = sa seule affaire", summaryB.open.n === 1 && summaryB.won.n === 0);
    expect("countContacts(B) = 1", (await contactsQ.countContacts(b.admin)) === 1);

    const tasksB = await tasksQ.listTasksBoard(b.admin);
    const allB = [...tasksB.overdue, ...tasksB.today, ...tasksB.upcoming, ...tasksB.noDue, ...tasksB.done];
    expect("tâches de B : aucune de A, les siennes présentes", !allB.some((t) => t.id === a!.openTaskId || t.id === a!.doneTaskId) && allB.some((t) => t.id === b!.openTaskId));
    const dueB = await tasksQ.getTasksDueSummary(b.admin, 10);
    expect("résumé « à faire » de B : uniquement sa tâche en retard", dueB.overdue === 1 && dueB.rows.every((t) => t.id !== a!.openTaskId));
    await expectThrow("listOpenTasksForDeal(B, affaire de A) → rien / refus", async () => {
      const rows = await tasksQ.listOpenTasksForDeal(b!.admin, a!.dealId);
      if (rows.length === 0) throw new Error("vide, comme attendu");
    });

    await expectThrow("listContactJournal(B, contact de A) refuse", () => activitiesQ.listContactJournal(b!.admin, a!.contactId));
    await expectThrow("listDealJournal(B, affaire de A) refuse", () => activitiesQ.listDealJournal(b!.admin, a!.dealId));
    const journalA = await activitiesQ.listContactJournal(a.admin, a.contactId);
    const kindsA = new Set(journalA.entries.map((e) => e.kind));
    expect(
      "journal du contact A complet (création, étape, partage, tâche achevée, appel)",
      ["deal_created", "stage", "share_sent", "task_done", "call"].every((k) => kindsA.has(k as never)),
      [...kindsA].join(",")
    );
    const orgJournalB = await activitiesQ.listOrganizationJournal(b.admin, 50);
    expect(
      "activité récente de B : aucune entrée liée à A",
      orgJournalB.entries.every((e) => e.dealId !== a!.dealId && e.contactId !== a!.contactId) && orgJournalB.entries.length > 0
    );

    await expectThrow("listDealShares(B, affaire de A) refuse", () => sharesQ.listDealShares(b!.admin, a!.dealId));
    const followB = await getFollowUpBoard(b.admin);
    const followIds = [...followB.pendingAlerts, ...followB.inProgress, ...followB.closed, ...followB.acceptedStale].map((r) => r.shareId);
    expect("suivi de B : son partage, jamais celui de A", followIds.includes(b.shareId) && !followIds.includes(a.shareId));

    console.log("\n--- Écritures : B ne peut rien écrire sur les données de A");
    await expectThrow("createActivity(B, affaire de A) refuse", () => activitiesQ.createActivity(b!.admin, b!.userId, { type: "note", content: "x", dealId: a!.dealId }));
    await expectThrow("createActivity(B, contact de A) refuse", () => activitiesQ.createActivity(b!.admin, b!.userId, { type: "call", contactId: a!.contactId }));
    await expectThrow("deleteActivity(B, interaction de A) refuse", () => activitiesQ.deleteActivity(b!.admin, a!.activityId));
    await expectThrow("completeTask(B, tâche de A) refuse", () => tasksQ.completeTask(b!.admin, a!.openTaskId, b!.userId));
    await expectThrow("changeDealStage(B, affaire de A) refuse", () => dealsQ.changeDealStage(b!.admin, b!.userId, a!.dealId, a!.statuses[2].id));
    await expectThrow("changeDealStage(A, affaire de A, étape de B) refuse", () => dealsQ.changeDealStage(a!.admin, a!.userId, a!.dealId, b!.statuses[2].id));
    await expectThrow("createDealShare(B, affaire de A, partenaire de B) refuse", () => sharesQ.createDealShare(b!.admin, b!.userId, { dealId: a!.dealId, partnerId: b!.partnerId }));
    await expectThrow("createDeal(B, contact de A) refuse", async () => {
      const [typeB] = await db.select().from(dealTypes).where(eq(dealTypes.organizationId, b!.orgId));
      return dealsQ.createDeal(b!.admin, b!.userId, { title: "x", clientName: "x", typeId: typeB.id, contactId: a!.contactId });
    });
    await expectThrow("updateContact(B, contact de A) refuse", () => contactsQ.updateContact(b!.admin, a!.contactId, { name: "Pirate" }));
    await expectThrow("deleteContact(B, contact de A) refuse", () => contactsQ.deleteContact(b!.admin, a!.contactId, b!.userId));
    await expectThrow("mergeContacts(B : son contact ← contact de A) refuse", () => contactsQ.mergeContacts(b!.admin, b!.contactId, a!.contactId, b!.userId));

    console.log("\n--- La base elle-même : une ligne qui mélange deux organisations est rejetée (FK composites)");
    const fkViolation = async (label: string, statement: Promise<unknown>) => {
      try {
        await statement;
        ko(label, "insertion acceptée");
      } catch (error) {
        const code = (error as { code?: string; cause?: { code?: string } }).code ?? (error as { cause?: { code?: string } }).cause?.code;
        expect(label, code === "23503", `code ${code ?? "inconnu"} : ${String(error).slice(0, 120)}`);
      }
    };
    await fkViolation(
      "activities(org B, contact de A) → 23503",
      db.insert(activities).values({ organizationId: b.orgId, type: "note", content: "x", contactId: a.contactId })
    );
    await fkViolation(
      "tasks(org B, affaire de A) → 23503",
      db.insert(tasks).values({ organizationId: b.orgId, title: "x", dealId: a.dealId })
    );
    await fkViolation(
      "deal_shares(org B, affaire de A, partenaire de B) → 23503",
      db.insert(dealShares).values({ organizationId: b.orgId, dealId: a.dealId, partnerId: b.partnerId, tokenHash: `forged-${Date.now()}` })
    );
    await fkViolation(
      "deals(org B, étape de A) → 23503",
      (async () => {
        const [typeB] = await db.select().from(dealTypes).where(eq(dealTypes.organizationId, b!.orgId));
        return db.insert(deals).values({
          organizationId: b!.orgId,
          title: "x",
          clientName: "x",
          typeId: typeB.id,
          pipelineId: b!.pipelineId,
          statusId: a!.statuses[0].id,
        });
      })()
    );
    await fkViolation(
      "deal_stage_changes(org B, affaire de A) → 23503",
      db.insert(dealStageChanges).values({ organizationId: b.orgId, dealId: a.dealId, toStatusId: b.statuses[0].id })
    );
    await fkViolation(
      "deal_events(org B, affaire de A) → 23503",
      db.insert(dealEvents).values({ organizationId: b.orgId, dealId: a.dealId, type: "commented", message: "x" })
    );
    await fkViolation(
      "contacts(org B, société de A) → 23503",
      db.insert(contacts).values({ organizationId: b.orgId, kind: "person", name: "x", companyId: a.contactId })
    );
    // Sanité : les lignes légitimes passent (sinon les refus ci-dessus ne prouveraient rien).
    const [sane] = await db
      .insert(activities)
      .values({ organizationId: b.orgId, type: "note", content: "légitime", contactId: b.contactId })
      .returning({ id: activities.id });
    expect("activities(org B, contact de B) acceptée", Boolean(sane?.id));
  } finally {
    console.log("\n--- Nettoyage : suppression des deux organisations, cascades vérifiées");
    const orgIds = [a?.orgId, b?.orgId].filter((x): x is string => Boolean(x));
    if (orgIds.length > 0) {
      await db.delete(organizations).where(inArray(organizations.id, orgIds));
      const counts = await Promise.all(
        [
          db.select({ n: count() }).from(organizations).where(inArray(organizations.slug, [...SLUGS])),
          db.select({ n: count() }).from(users).where(inArray(users.organizationId, orgIds)),
          db.select({ n: count() }).from(contacts).where(inArray(contacts.organizationId, orgIds)),
          db.select({ n: count() }).from(deals).where(inArray(deals.organizationId, orgIds)),
          db.select({ n: count() }).from(tasks).where(inArray(tasks.organizationId, orgIds)),
          db.select({ n: count() }).from(activities).where(inArray(activities.organizationId, orgIds)),
          db.select({ n: count() }).from(dealShares).where(inArray(dealShares.organizationId, orgIds)),
          db.select({ n: count() }).from(dealEvents).where(inArray(dealEvents.organizationId, orgIds)),
          db.select({ n: count() }).from(dealStageChanges).where(inArray(dealStageChanges.organizationId, orgIds)),
          db.select({ n: count() }).from(contactAccessLog).where(inArray(contactAccessLog.organizationId, orgIds)),
        ].map((query) => query.then(([r]) => Number(r.n)))
      );
      const row = {
        orgs: counts[0],
        users: counts[1],
        contacts: counts[2],
        deals: counts[3],
        tasks: counts[4],
        activities: counts[5],
        shares: counts[6],
        events: counts[7],
        stage_changes: counts[8],
        access_log: counts[9],
      };
      const total = Object.values(row).reduce((s, v) => s + v, 0);
      expect(`zéro reliquat (${Object.entries(row).map(([k, v]) => `${k}=${v}`).join(", ")})`, total === 0);
    }
  }

  if (failures > 0) {
    console.error(`\n✗ ÉCHEC : ${failures} contrôle(s) en défaut.`);
    process.exit(1);
  }
  console.log("\n✓ SUCCÈS : isolation vérifiée contre la base, décor supprimé.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("ERREUR:", err);
    process.exit(1);
  });
