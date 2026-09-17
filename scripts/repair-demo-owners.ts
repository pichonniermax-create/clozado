/**
 * Reprise des fiches de l'espace de DÉMO créées sans responsable en
 * substitution super admin (audit UX du 2026-09-17, constat 7) : les
 * contacts, affaires et tâches de la seule organisation de démo dont le
 * responsable est vide ou n'appartient pas à l'organisation reçoivent
 * l'admin le plus ancien de la démo — la règle par défaut du produit depuis
 * le correctif. Périmètre : `organizations.is_demo = true`, et rien d'autre.
 *
 *   npx tsx --env-file=.env.local scripts/repair-demo-owners.ts            (compte, n'écrit rien)
 *   npx tsx --env-file=.env.local scripts/repair-demo-owners.ts --apply    (écrit, journal avant/après)
 */
import { and, asc, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";

async function main() {
  const apply = process.argv.includes("--apply");
  const demos = await db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.isDemo, true));
  if (demos.length !== 1) throw new Error(`une seule organisation de démo attendue, ${demos.length} trouvée(s)`);
  const org = demos[0];
  const [admin] = await db.select({ id: users.id, email: users.email }).from(users).where(and(eq(users.organizationId, org.id), eq(users.role, "admin"))).orderBy(asc(users.createdAt)).limit(1);
  if (!admin) throw new Error("aucun admin dans l'organisation de démo");
  console.log(`organisation : ${org.name} (${org.id}) · responsable de reprise : ${admin.email} (${admin.id}) · mode : ${apply ? "APPLY" : "compte seulement"}`);

  const targets = [
    { table: "contacts", column: "owner_id", label: "contacts", extra: sql`and deleted_at is null` },
    { table: "deals", column: "owner_id", label: "affaires", extra: sql`` },
    { table: "tasks", column: "assignee_id", label: "tâches", extra: sql`and completed_at is null` },
  ] as const;
  for (const t of targets) {
    const where = sql`organization_id = ${org.id} ${t.extra} and (${sql.raw(t.column)} is null or ${sql.raw(t.column)} not in (select id from users where organization_id = ${org.id}))`;
    const rows = await db.execute(sql`select count(*)::int as n, count(*) filter (where ${sql.raw(t.column)} is null)::int as vides, count(*) filter (where ${sql.raw(t.column)} is not null)::int as etrangers from ${sql.raw(t.table)} where ${where}`);
    const r = rows.rows[0] as { n: number; vides: number; etrangers: number };
    console.log(`${t.label} : ${r.n} à reprendre (${r.vides} sans responsable, ${r.etrangers} avec un responsable hors organisation)`);
    if (apply && r.n > 0) {
      const updated = await db.execute(sql`update ${sql.raw(t.table)} set ${sql.raw(t.column)} = ${admin.id}, updated_at = now() where ${where} returning id`);
      console.log(`  → ${updated.rows.length} ${t.label} mis à jour`);
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
