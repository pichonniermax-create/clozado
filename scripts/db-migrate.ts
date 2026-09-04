/**
 * Applique les migrations via le migrateur officiel neon-http.
 *
 * Pourquoi pas `drizzle-kit migrate` ? Son driver de requêtage passe par
 * websocket, bloqué dans l'environnement de dev (échec silencieux, exit 1
 * sans message — constaté sur la migration 0007). Le migrateur
 * drizzle-orm/neon-http/migrator lit le même dossier et le même journal
 * (drizzle.__drizzle_migrations), mais parle HTTP comme le reste de l'app.
 *
 * ATTENTION : pas de transaction autour d'une migration sur neon-http —
 * un échec au milieu laisse un état partiel. Écrire chaque migration pour
 * être rejouable (backfills idempotents), comme 0007.
 *
 * Usage : npm run db:migrate:http
 *   (base locale : npx tsx --env-file=.env.local-demo scripts/db-migrate.ts)
 */
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { neon, neonConfig } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-http");
  const { migrate } = await import("drizzle-orm/neon-http/migrator");

  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL manquante.");
  // Base LOCALE de preuve (docs/module-demo.md §1.5) : même aiguillage que src/db/index.ts.
  if (process.env.DATABASE_HTTP_ENDPOINT) {
    const endpoint = process.env.DATABASE_HTTP_ENDPOINT;
    neonConfig.fetchEndpoint = () => endpoint;
    console.log(`→ base locale via ${endpoint}`);
  }
  const db = drizzle(neon(process.env.DATABASE_URL));
  await migrate(db, { migrationsFolder: "./src/db/migrations" });
  console.log("✓ migrations appliquées (journal : drizzle.__drizzle_migrations)");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
