import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL manquante. Ajoute-la dans les variables d'environnement.");
}

// Base LOCALE de preuve (docs/module-demo.md §1.5) : un Postgres dans Docker
// derrière un proxy HTTP compatible Neon, pour rejouer les migrations et
// piloter l'application sans toucher la base partagée par le dev et la
// production. La variable n'existe qu'en local ; sans elle, rien ne change.
if (process.env.DATABASE_HTTP_ENDPOINT) {
  const endpoint = process.env.DATABASE_HTTP_ENDPOINT;
  neonConfig.fetchEndpoint = () => endpoint;
}

const sql = neon(process.env.DATABASE_URL);

export const db = drizzle(sql, { schema });
