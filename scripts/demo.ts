/**
 * L'organisation de démonstration depuis la ligne de commande
 * (docs/module-demo.md §1.6) — le même code que l'espace gestionnaire.
 *
 *   npx tsx --env-file=.env.local-demo scripts/demo.ts create   # base LOCALE de preuve
 *   npx tsx --env-file=.env.local-demo scripts/demo.ts status
 *   npx tsx --env-file=.env.local scripts/demo.ts create        # base partagée — après l'accord sur la migration 0017
 *
 * `create` refuse si une démo existe déjà (rien n'est jamais remplacé ici) ;
 * la suppression appartient à la réinitialisation (§1.7).
 */
async function main() {
  const command = process.argv[2];
  const { createDemoOrganization, countDemoRows, getDemoOrganization } = await import("../src/lib/demo/seed");
  const { recordDemoSeed } = await import("../src/lib/demo/journal");

  if (command === "status") {
    const org = await getDemoOrganization();
    if (!org) {
      console.log("Aucune organisation de démo.");
      return;
    }
    console.log(`Démo : ${org.name} (${org.slug}, ${org.id}) — publique : ${org.demoPublicEnabled ? "oui" : "non"}`);
    console.table(await countDemoRows(org.id));
    return;
  }

  if (command === "create") {
    const started = Date.now();
    const result = await recordDemoSeed({ requestedBy: null, requestedByEmail: "scripts/demo.ts" }, () => createDemoOrganization());
    console.log(`✓ organisation de démo créée (${result.organizationId}) en ${Math.round((Date.now() - started) / 100) / 10} s`);
    console.table(result.counts);
    return;
  }

  console.error("Usage : scripts/demo.ts create | status");
  process.exit(2);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

// Ce fichier est un module (sinon `main` entrerait en collision avec les autres scripts au typecheck).
export {};
