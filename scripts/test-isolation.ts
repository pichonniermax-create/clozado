/**
 * Preuve concrète de l'isolation entre organisations : simule ce que
 * verrait chaque utilisateur en réutilisant getVisibleOrganizations,
 * la même fonction utilisée par les vraies pages de l'app.
 *
 * Prérequis : npm run db:seed-demo (crée les 2 organisations de test)
 * Usage : npm run db:test-isolation
 */
import { eq } from "drizzle-orm";
import { config } from "dotenv";
config({ path: ".env.local" });

function fail(message: string): never {
  console.error(`✗ ÉCHEC : ${message}`);
  process.exit(1);
}

async function main() {
  // Import dynamique : chargé APRÈS config() ci-dessus, pour la même
  // raison que dans seed-demo.ts.
  const { db } = await import("../src/db");
  const { organizations, users } = await import("../src/db/schema");
  const { getVisibleOrganizations } = await import(
    "../src/db/queries/organizations"
  );

  const dupont = await db.query.organizations.findFirst({
    where: eq(organizations.slug, "dupont"),
  });
  const martin = await db.query.organizations.findFirst({
    where: eq(organizations.slug, "martin"),
  });

  if (!dupont || !martin) {
    fail("Organisations de démo introuvables. Lance d'abord: npm run db:seed-demo");
  }

  const adminDupont = await db.query.users.findFirst({
    where: eq(users.email, "maxpichonnier@hotmail.com"),
  });
  const adminMartin = await db.query.users.findFirst({
    where: eq(users.email, "hexabrod@gmail.com"),
  });
  const superAdmin = await db.query.users.findFirst({
    where: eq(users.role, "super_admin"),
  });

  if (!adminDupont || !adminMartin || !superAdmin) {
    fail("Utilisateurs de démo introuvables. Lance d'abord: npm run db:seed-demo");
  }

  console.log("--- Ce que voit chaque utilisateur ---\n");

  const dupontView = await getVisibleOrganizations(adminDupont);
  console.log(
    `Admin Dupont (${adminDupont.email}) voit :`,
    dupontView.map((o) => o.name)
  );
  if (dupontView.length !== 1 || dupontView[0].id !== dupont.id) {
    fail("L'admin Dupont ne voit pas exactement sa propre organisation.");
  }
  if (dupontView.some((o) => o.id === martin.id)) {
    fail("FUITE : l'admin Dupont voit l'organisation Martin !");
  }

  const martinView = await getVisibleOrganizations(adminMartin);
  console.log(
    `Admin Martin (${adminMartin.email}) voit :`,
    martinView.map((o) => o.name)
  );
  if (martinView.length !== 1 || martinView[0].id !== martin.id) {
    fail("L'admin Martin ne voit pas exactement sa propre organisation.");
  }
  if (martinView.some((o) => o.id === dupont.id)) {
    fail("FUITE : l'admin Martin voit l'organisation Dupont !");
  }

  const superAdminView = await getVisibleOrganizations(superAdmin);
  console.log(
    `Super admin (${superAdmin.email}) voit :`,
    superAdminView.map((o) => o.name)
  );
  if (
    !superAdminView.some((o) => o.id === dupont.id) ||
    !superAdminView.some((o) => o.id === martin.id)
  ) {
    fail("Le super_admin devrait voir les deux organisations de démo.");
  }

  console.log("\n✓ SUCCÈS : isolation vérifiée.");
  console.log("  - Admin Dupont ne voit que Dupont");
  console.log("  - Admin Martin ne voit que Martin");
  console.log("  - Super admin voit les deux");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("ERREUR:", err);
    process.exit(1);
  });
