/**
 * Crée deux organisations de démonstration, chacune avec un admin, pour
 * pouvoir prouver concrètement l'isolation entre organisations (voir
 * scripts/test-isolation.ts). Idempotent : peut être relancé sans dupliquer
 * les données.
 *
 * Usage : npm run db:seed-demo
 */
import { eq } from "drizzle-orm";
import { config } from "dotenv";
config({ path: ".env.local" });

const DEMO_ORGS = [
  {
    name: "Courtier Dupont",
    slug: "dupont",
    adminEmail: "maxpichonnier@hotmail.com",
  },
  {
    name: "PME Martin",
    slug: "martin",
    adminEmail: "hexabrod@gmail.com",
  },
] as const;

async function main() {
  // Import dynamique : chargé APRÈS config() ci-dessus, sinon
  // src/db/index.ts planterait en ne trouvant pas encore DATABASE_URL
  // (les imports statiques sont évalués avant le reste du fichier).
  const { db } = await import("../src/db");
  const { organizations, users } = await import("../src/db/schema");

  for (const demo of DEMO_ORGS) {
    let org = await db.query.organizations.findFirst({
      where: eq(organizations.slug, demo.slug),
    });

    if (!org) {
      [org] = await db
        .insert(organizations)
        .values({ name: demo.name, slug: demo.slug })
        .returning();
      console.log(`✓ Organisation créée : ${org.name} (${org.id})`);
    } else {
      console.log(`= Organisation déjà existante : ${org.name} (${org.id})`);
    }

    const existingAdmin = await db.query.users.findFirst({
      where: eq(users.email, demo.adminEmail),
    });

    if (!existingAdmin) {
      const [admin] = await db
        .insert(users)
        .values({
          email: demo.adminEmail,
          role: "admin",
          organizationId: org.id,
        })
        .returning();
      console.log(`✓ Admin créé : ${admin.email} → ${org.name}`);
    } else {
      console.log(`= Admin déjà existant : ${existingAdmin.email}`);
    }
  }
}

main()
  .then(() => {
    console.log("\nSeed terminé.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("ERREUR:", err);
    process.exit(1);
  });
