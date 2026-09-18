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
  const metrics = await import("../src/lib/metrics");
  const sharesQ = await import("../src/db/queries/deal-shares");
  const tasksQ = await import("../src/db/queries/tasks");
  const activitiesQ = await import("../src/db/queries/activities");
  const { createPartner, updatePartner } = await import("../src/db/queries/partners");
  const { getFollowUpBoard } = await import("../src/db/queries/deal-follow-up");
  const { organizations, users, contacts, deals, tasks, activities, dealEvents, dealStageChanges, dealShares, dealTypes, dealStatuses, contactAccessLog, partners, commissions, pipelines } = schema;

  // Jamais deux passages simultanés, et jamais de reliquat d'un passage interrompu.
  const leftovers = await db.select({ id: organizations.id }).from(organizations).where(inArray(organizations.slug, [...SLUGS, "_iso-c"]));
  if (leftovers.length > 0) {
    console.log("Reliquats d'un passage précédent : suppression avant de commencer.");
    await db.delete(organizations).where(inArray(organizations.slug, [...SLUGS, "_iso-c"]));
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
    const volumesB = await metrics.volumesReport(b.admin, {});
    expect("volumes de B (couche des métriques) = sa seule affaire en cours, rien de signé", volumesB.open.n === 1 && volumesB.won.n === 0);
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

    const { translatorFor } = await import("../src/i18n/translator");
    const { DEFAULT_LOCALE } = await import("../src/i18n/locales");
    const tq = await translatorFor(DEFAULT_LOCALE, "activities.queries");
    const tc = await translatorFor(DEFAULT_LOCALE, "contacts.queries");
    await expectThrow("listContactJournal(B, contact de A) refuse", () => activitiesQ.listContactJournal(b!.admin, a!.contactId, tq));
    await expectThrow("listDealJournal(B, affaire de A) refuse", () => activitiesQ.listDealJournal(b!.admin, a!.dealId, tq));
    const journalA = await activitiesQ.listContactJournal(a.admin, a.contactId, tq);
    const kindsA = new Set(journalA.entries.map((e) => e.kind));
    expect(
      "journal du contact A complet (création, étape, partage, tâche achevée, appel)",
      ["deal_created", "stage", "share_sent", "task_done", "call"].every((k) => kindsA.has(k as never)),
      [...kindsA].join(",")
    );
    const orgJournalB = await activitiesQ.listOrganizationJournal(b.admin, 50, tq);
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
    await expectThrow("deleteContact(B, contact de A) refuse", () => contactsQ.deleteContact(b!.admin, a!.contactId, b!.userId, tc));
    await expectThrow("mergeContacts(B : son contact ← contact de A) refuse", () => contactsQ.mergeContacts(b!.admin, b!.contactId, a!.contactId, b!.userId, tc));

    // Affectation de masse (audit, constat S1) : l'entrée d'une action serveur est
    // du JSON libre — une clé `organizationId` ou `id` glissée dedans ne doit
    // JAMAIS atterrir dans l'écriture. Refus, ou écriture restée chez A : les
    // deux sont acceptables ; un partenaire apparu chez B ne l'est pas.
    console.log("\n--- Affectation de masse : une clé organizationId/id dans l'entrée n'écrit jamais chez l'autre");
    const forgedCreate = await createPartner(a.admin, { name: "Forgé", organizationId: b.orgId } as never).then(
      (p) => p,
      (error: unknown) => error
    );
    expect(
      "createPartner(A, {…, organizationId: B}) refusé ou resté chez A",
      forgedCreate instanceof Error || (forgedCreate as { organizationId: string }).organizationId === a.orgId,
      forgedCreate instanceof Error ? undefined : `organizationId=${(forgedCreate as { organizationId: string }).organizationId}`
    );
    const forgedUpdate = await updatePartner(a.admin, a.partnerId, { name: "Forgé", organizationId: b.orgId, id: b.partnerId } as never).then(
      () => null,
      (error: unknown) => error
    );
    const partnerA = await db.query.partners.findFirst({ where: eq(partners.id, a.partnerId) });
    const partnerB = await db.query.partners.findFirst({ where: eq(partners.id, b.partnerId) });
    expect(
      "updatePartner(A, partenaire de A, {organizationId: B, id: partenaire de B}) refusé, rien ne bouge",
      forgedUpdate instanceof Error && partnerA?.organizationId === a.orgId && partnerA.name === "Confrère A" && partnerB?.name === "Confrère B"
    );
    const [foreignPartners] = await db.select({ n: count() }).from(partners).where(and(eq(partners.organizationId, b.orgId), eq(partners.name, "Forgé")));
    expect("aucun partenaire « Forgé » chez B", foreignPartners.n === 0);
    await expectThrow("createDeal(A, {…, organizationId: B}) refuse", async () => {
      const [typeA] = await db.select().from(dealTypes).where(eq(dealTypes.organizationId, a!.orgId));
      return dealsQ.createDeal(a!.admin, a!.userId, { title: "x", clientName: "x", typeId: typeA.id, organizationId: b!.orgId } as never);
    });
    await expectThrow("updateDealDetails(A, affaire de A, {organizationId: B}) refuse", () =>
      dealsQ.updateDealDetails(a!.admin, a!.dealId, { estimatedAmount: "1", organizationId: b!.orgId } as never)
    );
    await expectThrow("createDealShare(A, {…, organizationId: B}) refuse", () =>
      sharesQ.createDealShare(a!.admin, a!.userId, { dealId: a!.dealId, partnerId: a!.partnerId, organizationId: b!.orgId } as never)
    );

    console.log("\n--- Le chemin nominal reste ouvert : la forme exacte du composeur (avec commission) passe le schéma strict");
    // Un seul partage en attente par (affaire, partenaire) : celui du décor est révoqué d'abord — et le doublon est refusé avant.
    await expectThrow("createDealShare(A, même affaire, même partenaire, un partage déjà en attente) refuse (409)", () =>
      sharesQ.createDealShare(a!.admin, a!.userId, { dealId: a!.dealId, partnerId: a!.partnerId })
    );
    await sharesQ.revokeDealShare(a.admin, a.shareId, a.userId);
    const { share: shareWithCommission } = await sharesQ.createDealShare(a.admin, a.userId, {
      dealId: a.dealId,
      partnerId: a.partnerId,
      proposedTerms: null,
      message: "Bonjour",
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
      commission: { basis: "percentage", rate: "10", fixedAmount: null, baseAmount: "1000" },
    });
    const commissionRow = await db.query.commissions.findFirst({ where: eq(commissions.shareId, shareWithCommission.id) });
    expect(
      "createDealShare(A, avec commission) écrit le partage ET la commission « prévue » chez A",
      shareWithCommission.organizationId === a.orgId &&
        commissionRow?.organizationId === a.orgId &&
        commissionRow.state === "prevue" &&
        Number(commissionRow.computedAmount) === 100 &&
        commissionRow.rate !== null &&
        Number(commissionRow.rate) === 10,
      commissionRow ? `state=${commissionRow.state} computed=${commissionRow.computedAmount}` : "aucune commission écrite"
    );


    console.log("\n--- Chasse aux failles (2026-09-14) : responsable étranger, renvoi, montant serveur, affaire close, journal, domaine, rôle");
    const publicQ = await import("../src/db/queries/deal-shares-public");
    const pipelinesQ = await import("../src/db/queries/pipelines");
    const domainQ = await import("../src/lib/email/domain");
    await expectThrow("createTask(A, assigneeId = admin de B) refuse", () => tasksQ.createTask(a!.admin, a!.userId, { title: "x", assigneeId: b!.userId }));
    await expectThrow("updateTask(A, tâche de A, assigneeId = admin de B) refuse", () => tasksQ.updateTask(a!.admin, a!.openTaskId, { title: "x", assigneeId: b!.userId }));
    const ownTask = await tasksQ.createTask(a.admin, a.userId, { title: "à moi", assigneeId: a.userId });
    expect("createTask(A, assigneeId = admin de A) passe", ownTask.assigneeId === a.userId);

    const partner2 = await createPartner(a.admin, { name: "Confrère A2" });
    const { share: s2, token: t2 } = await sharesQ.createDealShare(a.admin, a.userId, {
      dealId: a.dealId,
      partnerId: partner2.id,
      commission: { basis: "percentage", rate: "10", fixedAmount: null, baseAmount: "1000" },
    });
    const c2 = await db.query.commissions.findFirst({ where: eq(commissions.shareId, s2.id) });
    expect("montant de commission calculé côté serveur : 10 % de 1000 = 100.00", c2?.computedAmount === "100.00", c2?.computedAmount ?? "aucune");
    const accepted = await publicQ.applyPublicShareAction(t2, { type: "accept" });
    expect("le partenaire accepte par son jeton", accepted.ok);
    await expectThrow("reissueDealShare sur un partage accepté refuse (409)", () => sharesQ.reissueDealShare(a!.admin, a!.userId, s2.id));

    const partner3 = await createPartner(a.admin, { name: "Confrère A3" });
    const { share: s3 } = await sharesQ.createDealShare(a.admin, a.userId, {
      dealId: a.dealId,
      partnerId: partner3.id,
      commission: { basis: "fixed", rate: null, fixedAmount: "500", baseAmount: null },
    });
    const reissued = await sharesQ.reissueDealShare(a.admin, a.userId, s3.id);
    const [{ n: commissionsOnNew }] = await db.select({ n: count() }).from(commissions).where(eq(commissions.shareId, reissued.share.id));
    const [{ n: commissionsOnOld }] = await db.select({ n: count() }).from(commissions).where(eq(commissions.shareId, s3.id));
    expect("renvoi d'un partage en attente : la commission SUIT le nouveau partage, une seule ligne", Number(commissionsOnNew) === 1 && Number(commissionsOnOld) === 0, `nouveau=${commissionsOnNew} ancien=${commissionsOnOld}`);
    expect("renvoi : nouvelle fenêtre de validité (aucune à l'origine → aucune)", reissued.share.expiresAt === null);

    const openStatus = a.statuses.find((st) => st.outcome === null)!;
    const wonStatus = a.statuses.find((st) => st.outcome === "won")!;
    await db.update(deals).set({ statusId: wonStatus.id }).where(eq(deals.id, a.dealId));
    const closedTry = await publicQ.applyPublicShareAction(t2, { type: "status_change", statusId: openStatus.id });
    expect("status_change par jeton sur une affaire GAGNÉE → deal_closed, rien ne bouge", !closedTry.ok && closedTry.reason === "deal_closed" && (await db.query.deals.findFirst({ where: eq(deals.id, a.dealId) }))?.statusId === wonStatus.id, closedTry.ok ? "ok?!" : closedTry.reason);
    await db.update(deals).set({ statusId: a.statuses[1].id }).where(eq(deals.id, a.dealId));
    const pendingTry = await publicQ.applyPublicShareAction(reissued.token, { type: "status_change", statusId: openStatus.id });
    expect("status_change par jeton sur un partage EN ATTENTE → already_resolved", !pendingTry.ok && pendingTry.reason === "already_resolved", pendingTry.ok ? "ok?!" : pendingTry.reason);
    const declined = await publicQ.applyPublicShareAction(reissued.token, { type: "decline" });
    expect("le partenaire refuse", declined.ok);
    const commentTry = await publicQ.applyPublicShareAction(reissued.token, { type: "comment", message: "x" });
    expect("commentaire par jeton sur un partage REFUSÉ → already_resolved", !commentTry.ok && commentTry.reason === "already_resolved");

    const partner4 = await createPartner(a.admin, { name: "Confrère A4" });
    const { share: s4, token: t4 } = await sharesQ.createDealShare(a.admin, a.userId, { dealId: a.dealId, partnerId: partner4.id, expiresAt: new Date(Date.now() + 86_400_000) });
    await db.update(dealShares).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(dealShares.id, s4.id));
    for (let i = 0; i < 3; i++) await publicQ.resolvePublicShare(t4);
    const [{ n: expiredEvents }] = await db.select({ n: count() }).from(dealEvents).where(and(eq(dealEvents.shareId, s4.id), eq(dealEvents.type, "share_expired")));
    expect("trois consultations d'un jeton expiré → UNE ligne share_expired", Number(expiredEvents) === 1, String(expiredEvents));

    await expectThrow("declareEmailDomain(B, mail.clozado.fr) → domaine réservé, avant tout appel au fournisseur", () => domainQ.declareEmailDomain(b!.admin, "mail.clozado.fr"));
    await db.update(organizations).set({ emailDomain: "cabinet-a.invalid" }).where(eq(organizations.id, a.orgId));
    await expectThrow("declareEmailDomain(B, domaine déjà rattaché à A) → 409, avant tout appel au fournisseur", () => domainQ.declareEmailDomain(b!.admin, "cabinet-a.invalid"));
    await expectThrow("declareEmailDomain(membre de B, …) → 403", () => domainQ.declareEmailDomain({ role: "member", organizationId: b!.orgId }, "cabinet-b.invalid"));

    await expectThrow("updateStage(membre de B, étape de B) → 403 : réglage réservé à l'admin", () =>
      pipelinesQ.updateStage({ role: "member", organizationId: b!.orgId }, b!.statuses[0].id, { label: "x", color: null, probability: null, outcome: null })
    );
    await expectThrow("updateStage(admin A, couleur « #fff;position:fixed ») → couleur invalide", () =>
      pipelinesQ.updateStage(a!.admin, a!.statuses[0].id, { label: "Nouveau", color: "#fff;position:fixed", probability: null, outcome: null })
    );
    await pipelinesQ.updateStage(a.admin, a.statuses[0].id, { label: "Nouveau", color: "#AABBCC", probability: null, outcome: null });
    expect("updateStage(admin A, #AABBCC) normalise en #aabbcc", (await db.query.dealStatuses.findFirst({ where: eq(dealStatuses.id, a.statuses[0].id) }))?.color === "#aabbcc");

    console.log("\n--- Stabilisation, chantier A étape 1 : porte admin des envois automatiques, rattachements de tâche, listes bornées à l'affaire");
    const rulesQ = await import("../src/db/queries/rules");
    const lossQ = await import("../src/db/queries/loss-reasons");
    const { isAppError } = await import("../src/lib/errors");
    const expectAppError = async (label: string, fn: () => Promise<unknown>, key: string) => {
      try {
        await fn();
        ko(label, "aucune erreur levée");
      } catch (error) {
        expect(label, isAppError(error) && error.key === key, isAppError(error) ? `clé ${error.key}` : String(error).slice(0, 120));
      }
    };
    // S1 — un membre ne règle pas les envois automatiques, même par soumission forgée.
    await expectAppError(
      "updateAutoSendSettings(membre de B) → 403, clé « seul l'admin »",
      () => rulesQ.updateAutoSendSettings({ role: "member", organizationId: b!.orgId }, { autoSendEnabled: true, autoSendPeriodDays: 14, officeHoursStart: 9, officeHoursEnd: 18 }),
      "acces_refuse_seul_l_admin_de_l_7ac9"
    );
    await rulesQ.updateAutoSendSettings(b.admin, { autoSendEnabled: false, autoSendPeriodDays: 21, officeHoursStart: 8, officeHoursEnd: 19 });
    const orgB = await db.query.organizations.findFirst({ where: eq(organizations.id, b.orgId) });
    expect("updateAutoSendSettings(admin de B) passe et écrit (période 21, bureau 8-19)", orgB?.autoSendPeriodDays === 21 && orgB.officeHoursStart === 8 && orgB.officeHoursEnd === 19);
    // S3 — un rattachement forgé est refusé AVANT la base, avec une phrase.
    await expectAppError("createTask(B, contactId = contact de A) → refus lisible", () => tasksQ.createTask(b!.admin, b!.userId, { title: "forgée", contactId: a!.contactId }), "acces_refuse_cette_donnee_n_appartient_pas_044a");
    await expectAppError("createTask(B, dealId = affaire de A) → refus lisible", () => tasksQ.createTask(b!.admin, b!.userId, { title: "forgée", dealId: a!.dealId }), "acces_refuse_cette_donnee_n_appartient_pas_044a");
    await expectAppError("createTask(B, contactId inconnu) → contact introuvable", () => tasksQ.createTask(b!.admin, b!.userId, { title: "forgée", contactId: "00000000-0000-4000-8000-000000000000" }), "contact_introuvable");
    const [{ n: forgedTasks }] = await db.select({ n: count() }).from(tasks).where(and(eq(tasks.organizationId, b.orgId), eq(tasks.title, "forgée")));
    expect("aucune tâche « forgée » écrite chez B", Number(forgedTasks) === 0);
    const legit = await tasksQ.createTask(b.admin, b.userId, { title: "légitime", contactId: b.contactId, dealId: b.dealId });
    expect("createTask(B, contact et affaire de B) passe", legit.contactId === b.contactId && legit.dealId === b.dealId);
    // S4 — les listes d'une fiche d'affaire sont celles de SON organisation.
    const reasonA = await lossQ.createLossReason(a.admin, "Motif A");
    const reasonB = await lossQ.createLossReason(b.admin, "Motif B");
    const ofA = await lossQ.listLossReasonsOf(a.orgId);
    expect("listLossReasonsOf(A) = les motifs de A, jamais ceux de B", ofA.some((r) => r.id === reasonA?.id) && !ofA.some((r) => r.id === reasonB?.id));
    const usersOfA = await contactsQ.listOrgUsersOf(a.orgId);
    expect("listOrgUsersOf(A) = l'admin de A seulement", usersOfA.length === 1 && usersOfA[0].id === a.userId);

    console.log("\n--- Stabilisation, chantier A étape 2 : archiver et restaurer une règle, le nom d'une fiche retouchée");
    const ruleA = await rulesQ.createRule(a.admin, a.userId, { name: "Sans nouvelles", trigger: "no_interaction", thresholdDays: 30, conditions: {}, action: "create_task" });
    await rulesQ.archiveRule(a.admin, ruleA.id);
    expect("archiveRule(A) : la règle quitte listRules(A)", !(await rulesQ.listRules(a.admin)).some((r) => r.rule.id === ruleA.id));
    const withArchived = await rulesQ.listRules(a.admin, { includeArchived: true });
    expect("listRules(A, archivées comprises) la garde, marquée archivée", withArchived.some((r) => r.rule.id === ruleA.id && r.rule.archivedAt !== null));
    expect("listRules(B, archivées comprises) ne voit pas la règle de A", !(await rulesQ.listRules(b.admin, { includeArchived: true })).some((r) => r.rule.id === ruleA.id));
    await expectThrow("restoreRule(B, règle de A) refuse", () => rulesQ.restoreRule(b!.admin, ruleA.id));
    await rulesQ.restoreRule(a.admin, ruleA.id);
    const restored = (await rulesQ.listRules(a.admin)).find((r) => r.rule.id === ruleA.id);
    expect("restoreRule(A) : la règle revient dans la liste, désactivée", restored !== undefined && restored.rule.archivedAt === null && restored.rule.enabled === false);
    await db.update(contacts).set({ name: "Jean Dupont", firstName: null, lastName: null }).where(eq(contacts.id, a.contactId));
    await contactsQ.updateContact(a.admin, a.contactId, { name: "Jean", firstName: "Jean", lastName: null });
    expect("updateContact(prénom seul) garde « Jean Dupont »", (await db.query.contacts.findFirst({ where: eq(contacts.id, a.contactId) }))?.name === "Jean Dupont");
    await contactsQ.updateContact(a.admin, a.contactId, { name: "Jean Durand", firstName: "Jean", lastName: "Durand" });
    expect("updateContact(prénom + nom) recompose « Jean Durand »", (await db.query.contacts.findFirst({ where: eq(contacts.id, a.contactId) }))?.name === "Jean Durand");

    console.log("\n--- Stabilisation, chantier A étape 3 : plus de retour muet — un libellé vide a sa phrase");
    await expectAppError("updatePipelineLabel(A, libellé vide) → phrase", () => pipelinesQ.updatePipelineLabel(a!.admin, a!.pipelineId, "   "), "le_libelle_du_pipeline_est_obligatoire");
    await expectAppError("updateStage(A, libellé vide) → phrase", () => pipelinesQ.updateStage(a!.admin, a!.statuses[0].id, { label: "", color: null, probability: null, outcome: null }), "le_libelle_de_l_etape_est_obligatoire");
    await pipelinesQ.updatePipelineLabel(a.admin, a.pipelineId, "Crédit");
    expect("updatePipelineLabel(A, « Crédit ») passe", (await db.query.pipelines.findFirst({ where: eq(pipelines.id, a.pipelineId) }))?.label === "Crédit");

    console.log("\n--- Stabilisation, chantier A étape 4 : l'affaire complète, le type par défaut d'un espace neuf");
    const [typeA] = await db.select().from(dealTypes).where(eq(dealTypes.organizationId, a.orgId));
    const owned = await dealsQ.createDeal(a.admin, a.userId, { title: "Avec responsable", clientName: "Client", typeId: typeA.id });
    expect("createDeal sans responsable explicite → la personne qui crée", owned.ownerId === a.userId);
    const unowned = await dealsQ.createDeal(a.admin, a.userId, { title: "Sans responsable", clientName: "Client", typeId: typeA.id, ownerId: null });
    expect("createDeal avec « Personne » explicite → aucun responsable", unowned.ownerId === null);
    await expectAppError("createDeal(A, responsable = admin de B) refuse", () => dealsQ.createDeal(a!.admin, a!.userId, { title: "x", clientName: "x", typeId: typeA.id, ownerId: b!.userId }), "ce_conseiller_n_appartient_pas_a_l_dc88");
    await dealsQ.updateDealDetails(a.admin, unowned.id, { contactId: a.contactId });
    const attached = await db.query.deals.findFirst({ where: eq(deals.id, unowned.id) });
    const contactName = (await db.query.contacts.findFirst({ where: eq(contacts.id, a.contactId) }))?.name;
    expect("updateDealDetails(contactId) rattache la fiche et copie son nom", attached?.contactId === a.contactId && attached.clientName === contactName, `contact=${attached?.contactId} client=${attached?.clientName}`);
    await expectThrow("updateDealDetails(A, contactId = contact de B) refuse", () => dealsQ.updateDealDetails(a!.admin, unowned.id, { contactId: b!.contactId }));
    const signup = await import("../src/db/queries/signup");
    const created = await signup.createOrganizationWithAdmin({ organizationName: "Isolation C", email: "admin@_iso-c.invalid" });
    if (!created.ok) {
      ko("createOrganizationWithAdmin(C) a refusé", created.reason);
    } else {
      const typesC = await db.select().from(dealTypes).where(eq(dealTypes.organizationId, created.organizationId));
      expect("un espace neuf naît avec un type d'affaire par défaut (slug « dossier », libellé « Dossier »)", typesC.length === 1 && typesC[0].slug === "dossier" && typesC[0].label === "Dossier", typesC.map((t) => `${t.slug}:${t.label}`).join(","));
      // Le garde de la base ne laisse supprimer qu'une fixture dont le slug commence par « _ » : on le lui donne avant.
      await db.update(organizations).set({ slug: "_iso-c" }).where(eq(organizations.id, created.organizationId));
      await db.delete(organizations).where(eq(organizations.id, created.organizationId));
      expect("l'espace jetable C est supprimé", (await db.select({ n: count() }).from(organizations).where(eq(organizations.id, created.organizationId)))[0].n === 0);
    }

    console.log("\n--- Stabilisation, chantier A étape 5 : l'import reconnaît par téléphone et par nom + ville, un email reçu arrête la vague, les refus d'ingestion se comptent par organisation");
    // Deux fiches connues de A, sans email : l'une reconnaissable par son téléphone, l'autre par son nom et sa ville.
    const [paul, elodie] = await db
      .insert(contacts)
      .values([
        { organizationId: a.orgId, kind: "person", name: "Paul Import", phone: "+33 6 12 34 56 78" },
        { organizationId: a.orgId, kind: "person", name: "Élodie Durand", city: "Saint-Étienne" },
      ])
      .returning({ id: contacts.id });
    const report = await contactsQ.importContacts(
      a.admin,
      a.userId,
      [
        { line: 2, values: { name: "Paul Import", phone: "06 12 34 56 78", companyName: "Import SA" } },
        { line: 3, values: { name: "elodie durand", city: "saint-etienne", email: "elodie@_iso-a.invalid" } },
        { line: 4, values: { name: "Inconnu Nouveau", phone: "07 00 00 00 00" } },
        { line: 5, values: { name: "Paul Import", phone: "+33612345678" } },
      ],
      "complete",
      tc
    );
    expect(
      "ligne sans email reconnue par le TÉLÉPHONE → la fiche est complétée, pas doublée",
      report.completed.some((c) => c.line === 2 && c.matchedBy === "phone" && c.contactId === paul.id),
      JSON.stringify(report)
    );
    expect(
      "ligne reconnue par le NOM + la VILLE (accents et casse ignorés) → complétée, l'email posé",
      report.completed.some((c) => c.line === 3 && c.matchedBy === "name_city" && c.contactId === elodie.id && c.fields.includes("email")),
      JSON.stringify(report.completed)
    );
    expect(
      "ligne inconnue → créée ; même téléphone plus bas dans le fichier → écartée",
      report.inserted === 1 && report.skipped.length === 1 && report.skipped[0].line === 5,
      JSON.stringify({ inserted: report.inserted, skipped: report.skipped })
    );
    const paulAfter = await db.query.contacts.findFirst({ where: eq(contacts.id, paul.id) });
    expect("la fiche reconnue garde son nom et gagne la société", paulAfter?.name === "Paul Import" && paulAfter.companyName === "Import SA");
    const crossed = await contactsQ.importContacts(b.admin, b.userId, [{ line: 2, values: { name: "Paul Import", phone: "06 12 34 56 78" } }], "complete", tc);
    expect("B n'apparie jamais une fiche de A : le même téléphone crée une fiche chez B", crossed.inserted === 1 && crossed.completed.length === 0);

    // P4 — un email REÇU consigné à la main vaut « a répondu ».
    const replied = await activitiesQ.createActivity(a.admin, a.userId, { type: "email", direction: "inbound", content: "il a répondu", contactId: paul.id });
    const stopped = await db.query.contacts.findFirst({ where: eq(contacts.id, paul.id) });
    expect(
      "un email REÇU consigné dans la saisie rapide arrête la vague automatique (motif « a répondu »)",
      Boolean(replied.id) && stopped?.autoSendStoppedAt !== null && stopped?.autoSendStopReason === "replied",
      `stoppedAt=${stopped?.autoSendStoppedAt} reason=${stopped?.autoSendStopReason}`
    );
    await activitiesQ.createActivity(a.admin, a.userId, { type: "email", direction: "outbound", content: "je lui écris", contactId: elodie.id });
    const untouched = await db.query.contacts.findFirst({ where: eq(contacts.id, elodie.id) });
    expect("un email ENVOYÉ consigné à la main n'arrête rien", untouched?.autoSendStoppedAt === null);

    // P5 — les refus d'ingestion se comptent par motif, dans l'organisation seulement.
    const inboundQ = await import("../src/db/queries/inbound");
    const rejected = await inboundQ.insertInboundEmail({
      organizationId: a.orgId,
      providerEmailId: `iso-${Date.now()}`,
      messageIdHeader: null,
      receivedAt: new Date(),
      senderEmail: "inconnu@example.org",
      senderUserId: null,
      authResult: "unavailable",
      authDetail: null,
      status: "rejected",
      rejectionReason: "sender_not_member",
      mode: null,
      subject: "Refusé",
      counterpartEmail: null,
      counterpartName: null,
      originalDate: null,
      proposal: null,
      bodyText: null,
      sizeBytes: null,
    });
    const byReasonA = await inboundQ.countRejectionsByReason(a.admin);
    const byReasonB = await inboundQ.countRejectionsByReason(b.admin);
    expect("les refus d'ingestion de A se comptent par motif", byReasonA.some((r) => r.reason === "sender_not_member" && r.n === 1), JSON.stringify(byReasonA));
    expect("B ne voit aucun refus de A", byReasonB.length === 0, JSON.stringify(byReasonB));
    if (rejected) await db.delete(schema.inboundEmails).where(eq(schema.inboundEmails.id, rejected.id));

    console.log("\n--- Lot 1 : l'état d'affichage et les vues enregistrées ne franchissent pas la frontière");
    const prefs = await import("../src/db/queries/preferences");
    const viewsQ = await import("../src/db/queries/saved-views");
    const asSession = (f: Fixture) => ({ id: f.userId, email: null, name: null, role: "admin" as const, organizationId: f.orgId, readOnly: false });
    const [sessionA, sessionB] = [asSession(a), asSession(b)];
    await prefs.rememberPreference(sessionA, prefs.PREF.screen("contacts"), { q: "secret de A" });
    const prefsOfB = await prefs.getPreferences(sessionB);
    expect("les préférences d'affichage de A n'apparaissent pas chez B", prefsOfB.size === 0, JSON.stringify([...prefsOfB.entries()]));
    const viewOfA = await viewsQ.createView(sessionA, "contacts", "Vue de A", { params: { q: "secret de A" } });
    const viewsOfB = await viewsQ.listViews(sessionB, "contacts");
    expect("une vue de A n'est pas listée chez B", !viewsOfB.some((v) => v.id === viewOfA));
    expect("B voit quand même les vues FOURNIES de son organisation", viewsOfB.length > 0 && viewsOfB.every((v) => v.builtin));
    await expectThrow("B ne peut pas renommer la vue de A", () => viewsQ.renameView(sessionB, viewOfA, "Volée", "Volée"));
    await expectThrow("B ne peut pas supprimer la vue de A", () => viewsQ.deleteView(sessionB, viewOfA));
    await expectThrow("un member ne partage pas une vue à l'équipe", () =>
      viewsQ.setViewShared({ ...sessionA, role: "member" as const }, viewOfA, true)
    );
    // Partagée par l'admin de A, elle reste invisible chez B : le partage porte sur une équipe, pas sur le produit.
    await viewsQ.setViewShared(sessionA, viewOfA, true);
    const sharedSeenByB = await viewsQ.listViews(sessionB, "contacts");
    expect("une vue partagée de A reste invisible chez B", !sharedSeenByB.some((v) => v.id === viewOfA));
    // La définition n'accepte que la liste blanche de l'écran : un paramètre inventé ne s'écrit pas.
    const sanitized = viewsQ.sanitizeDefinition("contacts", { params: { q: "ok", inconnu: "x", erreur: "y" }, builtin: "n-importe-quoi" });
    expect("une définition de vue est bornée à la liste blanche de l'écran", JSON.stringify(sanitized) === JSON.stringify({ params: { q: "ok" } }), JSON.stringify(sanitized));

    console.log("\n--- Lot 2 : l'origine et l'apporteur d'un contact restent dans leur organisation");
    const originsQ = await import("../src/db/queries/acquisition");
    const partnersQ2 = await import("../src/db/queries/partners");
    const originA = await originsQ.createOrigin(a!.admin, "Salon de A (lot 2)");
    const confrereB = await partnersQ2.createPartner(b.admin, { name: "Confrère de B (lot 2)" });
    // Par les fonctions des écrans : B ne peut pas désigner l'origine de A, ni A le confrère de B.
    await expectThrow("créer chez B avec l'origine de A refuse", () =>
      contactsQ.createContact(b!.admin, b!.userId, { kind: "person", name: "Vol d'origine", originId: originA.id })
    );
    await expectThrow("créer chez A avec le confrère de B refuse", () =>
      contactsQ.createContact(a!.admin, a!.userId, { kind: "person", name: "Vol d'apporteur", partnerId: confrereB.id })
    );
    await expectThrow("modifier une fiche de B avec l'origine de A refuse", () =>
      contactsQ.updateContact(b!.admin, b!.contactId, { name: "Client B", originId: originA.id })
    );
    // Et la BASE elle-même refuse, clé composite à l'appui, si jamais une requête oubliait la vérification.
    await expectThrow("contacts(org B, origine de A) rejeté par la base", async () => {
      await db.insert(schema.contacts).values({ organizationId: b!.orgId, kind: "person", name: "Forcé", originId: originA.id });
    });
    await expectThrow("contacts(org A, partenaire de B) rejeté par la base", async () => {
      await db.insert(schema.contacts).values({ organizationId: a!.orgId, kind: "person", name: "Forcé", partnerId: confrereB.id });
    });
    // Le chemin nominal, lui, passe — et date l'attribution.
    const apporte = await contactsQ.createContact(a!.admin, a!.userId, {
      kind: "person",
      name: "Apportée chez A",
      originId: originA.id,
      partnerId: a!.partnerId,
      ownerId: a!.userId,
    });
    expect("une fiche de A accepte l'origine et le confrère de A, datés", Boolean(apporte.originId && apporte.partnerId && apporte.partnerAttributedAt && apporte.ownerAssignedAt));

    console.log("\n--- Lot 3 : un filtre ne traverse pas la frontière, et ne rapproche rien hors de son espace");
    const filtersLib = await import("../src/lib/display/filters");
    // B filtre sur l'étiquette, l'origine et le conseiller de A : la requête reste bornée à B, zéro résultat.
    const crossing = filtersLib.parseFilters("contacts", `conseiller:eq:${a!.userId},origine:eq:${originA.id}`);
    expect("le filtre est bien lu (deux conditions)", crossing.length === 2, JSON.stringify(crossing));
    const leaked = await contactsQ.listContacts(b!.admin, { filters: crossing });
    expect("B ne voit RIEN en filtrant sur les éléments de A", leaked.total === 0, String(leaked.total));
    // Et le même filtre chez A rapproche bien la fiche apportée.
    const found = await contactsQ.listContacts(a!.admin, { filters: filtersLib.parseFilters("contacts", `origine:eq:${originA.id}`) });
    expect("chez A, le même filtre rapproche sa fiche", found.total === 1, String(found.total));
    // Un identifiant qui n'existe nulle part : la condition est gardée et ne rapproche rien (jamais élargir).
    const ghost = await contactsQ.listContacts(a!.admin, {
      filters: filtersLib.parseFilters("contacts", "origine:eq:00000000-0000-0000-0000-000000000000"),
    });
    expect("un identifiant inexistant ne rapproche rien, et n'élargit pas", ghost.total === 0, String(ghost.total));

    console.log("\n--- La garde de connexion de la démo : qui reçoit un lien de connexion, qui n'en reçoit pas");
    const guard = await import("../src/lib/auth/magic-link-guard");
    const { DEMO_ORGANIZATION_ID, isReservedExampleAddress } = await import("../src/lib/demo/constants");
    const demoUsers = await db.select({ email: users.email, role: users.role }).from(users).where(eq(users.organizationId, DEMO_ORGANIZATION_ID));
    if (demoUsers.length === 0) {
      console.log("  (aucune organisation de démo sur cette base : contrôles sautés)");
    } else {
      expect("une adresse jamais rattachée à aucun compte ne reçoit aucun lien", (await guard.canReceiveMagicLink(`inconnu-${Date.now()}@gmail.com`)) === false);
      const fictional = demoUsers.filter((u) => isReservedExampleAddress(u.email));
      expect(`les personas de la démo à adresse fictive (${fictional.length}) ne reçoivent aucun lien`, fictional.length > 0 && (await Promise.all(fictional.map((u) => guard.canReceiveMagicLink(u.email)))).every((v) => v === false));
      const real = demoUsers.filter((u) => !isReservedExampleAddress(u.email));
      expect(
        `seules les adresses réelles rattachées par script reçoivent un lien (${real.length} : ${real.map((u) => `${u.role} ${u.email.replace(/^(.).*@/, "$1…@")}`).join(", ") || "aucune"})`,
        (await Promise.all(real.map((u) => guard.canReceiveMagicLink(u.email)))).every((v) => v === true)
      );
      expect("le compte jetable de ce script (adresse .invalid) ne reçoit aucun lien non plus", (await guard.canReceiveMagicLink(`admin@${SLUGS[0]}.invalid`)) === false);
    }

    console.log("\n--- La démo publique reste en lecture seule (sonde HTTP sur le site en ligne)");
    // Le site EN LIGNE par défaut : `.env.local` porte APP_URL=http://localhost:3000 (le serveur local), qui ne
    // prouverait rien. PROBE_URL surcharge ; un APP_URL en https est accepté (Vercel).
    const appUrl = (process.env.PROBE_URL ?? (process.env.APP_URL?.startsWith("https://") ? process.env.APP_URL : "https://clozado.vercel.app")).replace(/\/$/, "");
    // Une sonde réseau échoue parfois d'un aléa (DNS, reprise TLS) : un second essai avant de conclure, et la cause dans le détail.
    const probe = async (input: string, init?: RequestInit): Promise<Response> => {
      try {
        return await fetch(input, init);
      } catch {
        await new Promise((r) => setTimeout(r, 1500));
        return fetch(input, init);
      }
    };
    try {
      const entry = await probe(`${appUrl}/demo`, { redirect: "manual" });
      if (entry.status === 404) {
        console.log("  (démo publique fermée : contrôles sautés)");
      } else {
        const setCookie = entry.headers.get("set-cookie") ?? "";
        const cookie = /clozado-demo=([^;]+)/.exec(setCookie)?.[1];
        expect(`GET /demo → 303 vers /dashboard?visite=1 avec un cookie de visite (${entry.status})`, entry.status === 303 && (entry.headers.get("location") ?? "").includes("/dashboard") && Boolean(cookie));
        if (cookie) {
          const headers = { cookie: `clozado-demo=${cookie}` };
          const read = await probe(`${appUrl}/contacts`, { headers, redirect: "manual" });
          expect(`GET /contacts avec le cookie → lecture permise (${read.status})`, read.status === 200);
          const write = await probe(`${appUrl}/contacts`, { method: "POST", headers, redirect: "manual", body: "" });
          expect(`POST /contacts avec le cookie → 303 vers ?demo=lecture-seule (${write.status})`, write.status === 303 && (write.headers.get("location") ?? "").includes("demo=lecture-seule"));
          const settings = await probe(`${appUrl}/settings`, { headers, redirect: "manual" });
          expect(`GET /settings avec le cookie → 303 vers /dashboard?demo=lecture-seule (${settings.status})`, settings.status === 303 && (settings.headers.get("location") ?? "").includes("demo=lecture-seule"));
          const api = await probe(`${appUrl}/api/contacts/00000000-0000-4000-8000-000000000000/export`, { method: "POST", headers, redirect: "manual", body: "" });
          expect(`POST /api/… avec le cookie → 403 demo_read_only (${api.status})`, api.status === 403);
        }
      }
    } catch (error) {
      const cause = (error as { cause?: { errors?: { code?: string; address?: string; message?: string }[]; code?: string; message?: string } }).cause;
      const detail = cause?.errors ? cause.errors.map((e) => `${e.code ?? "?"} ${e.address ?? ""} ${e.message ?? ""}`).join(" | ") : `${cause?.code ?? ""} ${cause?.message ?? String(cause ?? "?")}`;
      ko("sonde HTTP de la démo publique", `${String(error)} — cause : ${detail}`);
    }

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
          db.select({ n: count() }).from(commissions).where(inArray(commissions.organizationId, orgIds)),
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
        commissions: counts[10],
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
