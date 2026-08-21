/**
 * Peuple le module PRM pour les deux organisations de démo (npm run
 * db:seed-demo, prérequis) : statuts d'affaire par défaut, types d'affaire,
 * quelques partenaires. Types volontairement différents d'une organisation
 * à l'autre — preuve qu'aucune ligne de code n'est spécifique à un
 * vocabulaire métier.
 *
 * Idempotent. Usage : npm run db:seed-prm-demo (après npm run db:seed-demo)
 */
import { and, eq } from "drizzle-orm";
import { config } from "dotenv";
config({ path: ".env.local" });

const DEMO_CONTENT = {
  dupont: {
    dealTypes: ["Crédit immobilier", "Rachat de crédit", "Assurance emprunteur"],
    partners: [
      { name: "Camille Rousseau", company: "Rousseau Patrimoine", profession: "CGP", email: "camille@rousseau-patrimoine.fr" },
      { name: "Karim Benali", company: "Benali Assurances", profession: "Courtier assurance", email: "karim@benali-assurances.fr" },
    ],
  },
  martin: {
    dealTypes: ["Assurance-vie", "SCPI", "Défiscalisation"],
    partners: [
      { name: "Sophie Lenoir", company: "Lenoir Immobilier", profession: "Agent immobilier", email: "sophie@lenoir-immo.fr" },
      { name: "Antoine Fabre", company: null, profession: "Notaire", email: "a.fabre@notaires.fr" },
    ],
  },
} as const;

async function main() {
  const { db } = await import("../src/db");
  const { organizations, dealStatuses, dealTypes, partners } = await import("../src/db/schema");
  const { seedDefaultDealStatuses } = await import("../src/db/queries/deal-statuses");

  for (const [slug, content] of Object.entries(DEMO_CONTENT)) {
    const org = await db.query.organizations.findFirst({ where: eq(organizations.slug, slug) });
    if (!org) {
      console.log(`⚠ Organisation "${slug}" introuvable — lance d'abord npm run db:seed-demo.`);
      continue;
    }

    const existingStatuses = await db.query.dealStatuses.findFirst({
      where: eq(dealStatuses.organizationId, org.id),
    });
    if (!existingStatuses) {
      await seedDefaultDealStatuses(org.id);
      console.log(`✓ Statuts d'affaire par défaut créés : ${org.name}`);
    } else {
      console.log(`= Statuts d'affaire déjà existants : ${org.name}`);
    }

    for (const [position, label] of content.dealTypes.entries()) {
      const existing = await db.query.dealTypes.findFirst({
        where: and(eq(dealTypes.organizationId, org.id), eq(dealTypes.label, label)),
      });
      if (!existing) {
        await db.insert(dealTypes).values({
          organizationId: org.id,
          slug: label.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
          label,
          position,
        });
        console.log(`✓ Type d'affaire créé : ${label} (${org.name})`);
      } else {
        console.log(`= Type d'affaire déjà existant : ${label}`);
      }
    }

    for (const p of content.partners) {
      const existing = await db.query.partners.findFirst({
        where: and(eq(partners.organizationId, org.id), eq(partners.name, p.name)),
      });
      if (!existing) {
        await db.insert(partners).values({ organizationId: org.id, ...p });
        console.log(`✓ Partenaire créé : ${p.name} (${org.name})`);
      } else {
        console.log(`= Partenaire déjà existant : ${p.name}`);
      }
    }
  }
}

main()
  .then(() => {
    console.log("\nSeed PRM terminé.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("ERREUR:", err);
    process.exit(1);
  });
