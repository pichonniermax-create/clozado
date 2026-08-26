/**
 * Jeu de données de performance du module relationnel — dans une
 * organisation de test DÉDIÉE, jamais dans une organisation existante.
 *
 * Usage :
 *   npx tsx --env-file=.env.local scripts/perf-dataset.ts create   # 5 000 contacts (étiquetés par hachage), 500 affaires, 2 000 tâches, 3 000 interactions, 1 000 passages d'étape
 *   npx tsx --env-file=.env.local scripts/perf-dataset.ts status   # ce qui existe
 *   npx tsx --env-file=.env.local scripts/perf-dataset.ts destroy  # supprime EXACTEMENT ce qui a été créé
 *
 * Réversibilité : tout appartient à l'organisation au slug réservé
 * `_perf-test` ; `destroy` supprime cette organisation — les cascades
 * emportent contacts, affaires, tâches, statuts, pipeline, utilisateur —
 * puis vérifie qu'il ne reste rien.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const SLUG = "_perf-test";
const N_CONTACTS = 5000;
const N_DEALS = 500;
const N_TASKS = 2000;
const N_ACTIVITIES = 3000;

const FIRST = ["Camille", "Julie", "Marc", "Sophie", "Éric", "Nadia", "Paul", "Inès", "Hugo", "Léa", "Karim", "Anne", "Louis", "Emma", "Yann", "Sarah", "Nicolas", "Chloé", "Pierre", "Manon"];
const LAST = ["Marchand", "Dupont", "Bernard", "Petit", "Robert", "Richard", "Durand", "Moreau", "Laurent", "Simon", "Michel", "Lefebvre", "Leroy", "Roux", "David", "Bertrand", "Morel", "Fournier", "Girard", "Bonnet"];
const COMPANIES = ["Cap Patrimoine", "Crédit Conseil", "Immo Horizon", "Alliance Courtage", "Fidelis Gestion", "Novapierre", "Axiome Finance", "Cabinet Delta", "Priméa", "Volta Invest"];
const CITIES = ["Paris", "Lyon", "Bordeaux", "Nantes", "Lille", "Marseille", "Toulouse", "Rennes", "Strasbourg", "Nice"];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

async function main() {
  const cmd = process.argv[2];
  const { db } = await import("../src/db");
  const { activities, contacts, contactTagAssignments, contactTags, deals, dealStageChanges, dealTypes, organizations, tasks, users } =
    await import("../src/db/schema");
  const { seedDefaultDealStatuses } = await import("../src/db/queries/deal-statuses");
  const { eq, count, sql } = await import("drizzle-orm");

  const existing = await db.query.organizations.findFirst({ where: eq(organizations.slug, SLUG) });

  if (cmd === "status") {
    if (!existing) {
      console.log("Aucune organisation de test — la base est dans son état normal.");
      return;
    }
    const [[c], [d], [t], [a], [s]] = await Promise.all([
      db.select({ n: count() }).from(contacts).where(eq(contacts.organizationId, existing.id)),
      db.select({ n: count() }).from(deals).where(eq(deals.organizationId, existing.id)),
      db.select({ n: count() }).from(tasks).where(eq(tasks.organizationId, existing.id)),
      db.select({ n: count() }).from(activities).where(eq(activities.organizationId, existing.id)),
      db.select({ n: count() }).from(dealStageChanges).where(eq(dealStageChanges.organizationId, existing.id)),
    ]);
    console.log(`Organisation ${SLUG} : ${c.n} contacts, ${d.n} affaires, ${t.n} tâches, ${a.n} interactions, ${s.n} passages d'étape.`);
    return;
  }

  if (cmd === "destroy") {
    if (!existing) {
      console.log("Rien à supprimer.");
      return;
    }
    await db.delete(organizations).where(eq(organizations.id, existing.id));
    const still = await db.query.organizations.findFirst({ where: eq(organizations.slug, SLUG) });
    const [[orphans], [orphanActivities]] = await Promise.all([
      db.select({ n: count() }).from(contacts).where(eq(contacts.organizationId, existing.id)),
      db.select({ n: count() }).from(activities).where(eq(activities.organizationId, existing.id)),
    ]);
    if (still || orphans.n > 0 || orphanActivities.n > 0) {
      console.error("✗ La suppression n'est pas complète — à inspecter.");
      process.exit(1);
    }
    console.log("✓ Organisation de test supprimée, cascades vérifiées : zéro contact, zéro interaction restants.");
    return;
  }

  if (cmd !== "create") {
    console.log("Commande attendue : create | status | destroy");
    process.exit(1);
  }
  if (existing) {
    console.log(`L'organisation ${SLUG} existe déjà — lance d'abord destroy.`);
    process.exit(1);
  }

  // Pack « courtier en crédit » : les cibles proposées par le métier
  // (chantier ciblage) se créent d'un clic sur /cibles et trouvent leurs
  // étiquettes ci-dessous.
  const [org] = await db
    .insert(organizations)
    .values({ name: "Organisation de test (perf)", slug: SLUG, businessPack: "courtier_credit" })
    .returning();
  const [user] = await db
    .insert(users)
    .values({ email: `perf-test@${SLUG}.invalid`, name: "Testeur Perf", role: "admin", organizationId: org.id })
    .returning();
  await seedDefaultDealStatuses(org.id);
  const [type] = await db.insert(dealTypes).values({ organizationId: org.id, slug: "credit", label: "Crédit" }).returning();
  const statuses = await db.query.dealStatuses.findMany({ where: eq((await import("../src/db/schema")).dealStatuses.organizationId, org.id) });

  console.time(`insertion de ${N_CONTACTS} contacts`);
  const CHUNK = 500;
  const contactIds: string[] = [];
  for (let i = 0; i < N_CONTACTS; i += CHUNK) {
    const values = Array.from({ length: Math.min(CHUNK, N_CONTACTS - i) }, (_, j) => {
      const n = i + j;
      const first = pick(FIRST, n);
      const last = pick(LAST, Math.floor(n / FIRST.length));
      return {
        organizationId: org.id,
        kind: "person" as const,
        name: `${first} ${last} ${n}`,
        firstName: first,
        lastName: `${last} ${n}`,
        email: `${first.toLowerCase()}.${last.toLowerCase()}.${n}@exemple-perf.fr`,
        phone: `06${String(10000000 + n).slice(0, 8)}`,
        companyName: pick(COMPANIES, n),
        city: pick(CITIES, n),
        country: n % 7 === 0 ? "Suisse" : "France",
        source: "import" as const,
        createdBy: user.id,
      };
    });
    const inserted = await db.insert(contacts).values(values).returning({ id: contacts.id });
    contactIds.push(...inserted.map((r) => r.id));
  }
  console.timeEnd(`insertion de ${N_CONTACTS} contacts`);

  // Étiquettes posées par hachage de l'id, côté base (jamais ligne par
  // ligne) : « Investisseur » sur un contact sur trois, « Primo-accédant »
  // sur un sur cinq, « VIP » sur un sur cinquante — de quoi mesurer les
  // segments du chantier ciblage sur une distribution réaliste.
  console.time("étiquetage par hachage");
  const tagRows = await db
    .insert(contactTags)
    .values([
      { organizationId: org.id, label: "Investisseur", position: 0 },
      { organizationId: org.id, label: "Primo-accédant", position: 1 },
      { organizationId: org.id, label: "VIP", position: 2 },
    ])
    .returning();
  for (const [tag, modulo] of [[tagRows[0], 3], [tagRows[1], 5], [tagRows[2], 50]] as const) {
    await db.execute(
      sql`INSERT INTO ${contactTagAssignments} (organization_id, contact_id, tag_id)
          SELECT ${org.id}::uuid, ${contacts.id}, ${tag.id}::uuid FROM ${contacts}
          WHERE ${contacts.organizationId} = ${org.id} AND abs(hashtext(${contacts.id}::text)) % ${modulo} = 0
          ON CONFLICT DO NOTHING`
    );
  }
  console.timeEnd("étiquetage par hachage");

  console.time(`insertion de ${N_DEALS} affaires`);
  const dealIds: string[] = [];
  for (let i = 0; i < N_DEALS; i += CHUNK) {
    const values = Array.from({ length: Math.min(CHUNK, N_DEALS - i) }, (_, j) => {
      const n = i + j;
      const status = statuses[n % statuses.length];
      return {
        organizationId: org.id,
        title: `Dossier ${pick(CITIES, n)} ${n}`,
        clientName: `Client ${n}`,
        contactId: contactIds[n * 7 % contactIds.length],
        typeId: type.id,
        pipelineId: status.pipelineId,
        statusId: status.id,
        estimatedAmount: String(50000 + (n % 40) * 12500),
        expectedCloseDate: `2026-${String(1 + (n % 12)).padStart(2, "0")}-15`,
        ownerId: user.id,
        createdBy: user.id,
      };
    });
    const inserted = await db.insert(deals).values(values).returning({ id: deals.id });
    dealIds.push(...inserted.map((r) => r.id));
  }
  console.timeEnd(`insertion de ${N_DEALS} affaires`);

  // Deux passages par affaire (entrée, puis un déplacement) : le journal
  // unifié les lit, les durées par étape aussi.
  console.time(`insertion de ${N_DEALS * 2} passages d'étape`);
  for (let i = 0; i < dealIds.length; i += CHUNK / 2) {
    const slice = dealIds.slice(i, i + CHUNK / 2);
    const values = slice.flatMap((dealId, j) => {
      const n = i + j;
      const from = statuses[n % statuses.length];
      const to = statuses[(n + 1) % statuses.length];
      const entered = new Date(Date.now() - (30 + (n % 60)) * 24 * 3600 * 1000);
      const moved = new Date(entered.getTime() + (1 + (n % 20)) * 24 * 3600 * 1000);
      return [
        { organizationId: org.id, dealId, fromStatusId: null, toStatusId: from.id, actorUserId: user.id, changedAt: entered },
        { organizationId: org.id, dealId, fromStatusId: from.id, toStatusId: to.id, actorUserId: user.id, changedAt: moved },
      ];
    });
    await db.insert(dealStageChanges).values(values);
  }
  console.timeEnd(`insertion de ${N_DEALS * 2} passages d'étape`);

  console.time(`insertion de ${N_TASKS} tâches`);
  for (let i = 0; i < N_TASKS; i += CHUNK) {
    const values = Array.from({ length: Math.min(CHUNK, N_TASKS - i) }, (_, j) => {
      const n = i + j;
      const done = n % 3 === 0;
      return {
        organizationId: org.id,
        title: `Relancer le dossier ${n}`,
        dueAt: new Date(Date.now() + (n % 60 - 20) * 24 * 3600 * 1000),
        priority: (["low", "normal", "high"] as const)[n % 3],
        status: (done ? "done" : "open") as "done" | "open",
        completedAt: done ? new Date() : null,
        assigneeId: user.id,
        contactId: contactIds[n * 3 % contactIds.length],
        createdBy: user.id,
      };
    });
    await db.insert(tasks).values(values);
  }
  console.timeEnd(`insertion de ${N_TASKS} tâches`);

  // Interactions : deux tiers sur des contacts, un tiers sur des affaires
  // (rattachées aussi à leur client, comme le fait la saisie rapide). Le
  // contact 0 en concentre beaucoup : c'est lui qu'on mesure.
  console.time(`insertion de ${N_ACTIVITIES} interactions`);
  const types = ["call", "email", "meeting", "note"] as const;
  for (let i = 0; i < N_ACTIVITIES; i += CHUNK) {
    const values = Array.from({ length: Math.min(CHUNK, N_ACTIVITIES - i) }, (_, j) => {
      const n = i + j;
      const onDeal = n % 3 === 0;
      const contactId = n % 10 === 0 ? contactIds[0] : contactIds[(n * 11) % contactIds.length];
      return {
        organizationId: org.id,
        type: types[n % types.length],
        content: `Interaction ${n} — compte rendu de test.`,
        occurredAt: new Date(Date.now() - (n % 400) * 6 * 3600 * 1000),
        contactId,
        dealId: onDeal ? dealIds[n % dealIds.length] : null,
        createdBy: user.id,
      };
    });
    await db.insert(activities).values(values);
  }
  console.timeEnd(`insertion de ${N_ACTIVITIES} interactions`);
  console.log(`✓ Jeu créé dans l'organisation ${SLUG} (${org.id}). Contact le plus chargé : ${contactIds[0]}.`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
