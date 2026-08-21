/** Mesures réelles de la recherche à 5 000 fiches — requêtes ET HTTP. Temporaire. */
import { config } from "dotenv";
config({ path: ".env.local" });
import { encode } from "next-auth/jwt";

async function main() {
  const { db } = await import("../src/db");
  const { organizations, users } = await import("../src/db/schema");
  const { listContacts } = await import("../src/db/queries/contacts");
  const { eq } = await import("drizzle-orm");

  const org = await db.query.organizations.findFirst({ where: eq(organizations.slug, "_perf-test") });
  const user = await db.query.users.findFirst({ where: eq(users.organizationId, org!.id) });
  const scope = { role: "admin" as const, organizationId: org!.id };

  const queries: [string, Parameters<typeof listContacts>[1]][] = [
    ["liste page 1 (sans filtre)", {}],
    ["liste page 50 (offset 2450)", { page: 50 }],
    ["nom « marchand »", { q: "marchand" }],
    ["email « .123@ »", { q: ".123@" }],
    ["société « fidelis »", { q: "fidelis" }],
    ["téléphone « 06 10 00 23 »", { q: "06 10 00 23" }],
    ["sans résultat « zzzz »", { q: "zzzz" }],
  ];

  console.log("--- Requêtes (fonction listContacts réelle, base distante) ---");
  for (const [label, opts] of queries) {
    await listContacts(scope, opts); // échauffement (connexion)
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const r = await listContacts(scope, opts);
      times.push(performance.now() - t0);
      if (i === 0) console.log(`  ${label} → ${r.total} résultat(s)`);
    }
    times.sort((a, b) => a - b);
    console.log(`    médiane ${times[2].toFixed(0)} ms · min ${times[0].toFixed(0)} · max ${times[4].toFixed(0)}`);
  }

  console.log("\n--- HTTP (page complète /contacts, serveur dev, session forgée) ---");
  const token = await encode({
    token: { email: user!.email, sub: user!.id, name: user!.name },
    secret: process.env.AUTH_SECRET!,
    salt: "authjs.session-token",
  });
  for (const q of ["", "marchand", "fidelis", "06 10 00 23"]) {
    const url = `http://localhost:3000/contacts${q ? `?q=${encodeURIComponent(q)}` : ""}`;
    await fetch(url, { headers: { cookie: `authjs.session-token=${token}` } }); // échauffement compile
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const res = await fetch(url, { headers: { cookie: `authjs.session-token=${token}` } });
      await res.text();
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    console.log(`  ${q || "(liste)"} → médiane ${times[2].toFixed(0)} ms · min ${times[0].toFixed(0)} · max ${times[4].toFixed(0)}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
