/**
 * Le compte MEMBER de test de l'organisation de démo (plan de stabilisation,
 * complément à l'étape 1 du chantier A) : la persona « Thomas Renard »
 * (`DEMO_MEMBER_ID`, rôle `member`, 17 contacts, 11 affaires et 11 tâches
 * attribués par le semis) reçoit une adresse RÉELLE pour qu'une personne
 * puisse s'y connecter par lien magique et voir le produit en member.
 *
 *   npx tsx --env-file=.env.local scripts/demo-member.ts attach --email=prenom+thomas@exemple.fr
 *   npx tsx --env-file=.env.local scripts/demo-member.ts status
 *   npx tsx --env-file=.env.local scripts/demo-member.ts detach      # remet l'adresse fictive du jeu de données
 *
 * Réversible et borné : une seule ligne `users` (l'id fixe de Thomas, dans
 * l'organisation marquée `is_demo`) change d'adresse ; rien d'autre n'est
 * touché, aucune autre organisation n'est lue. Une réinitialisation de la
 * démo recrée Thomas avec son adresse fictive : relancer `attach` ensuite.
 */
import { isReservedExampleAddress } from "../src/lib/demo/constants";

async function main() {
  const command = process.argv[2];
  const { db } = await import("../src/db");
  const s = await import("../src/db/schema");
  const { and, count, eq } = await import("drizzle-orm");
  const { DEMO_ORGANIZATION_ID, DEMO_MEMBER_ID } = await import("../src/lib/demo/constants");
  const D = await import("../src/lib/demo/dataset");

  const org = (await db.select({ id: s.organizations.id, name: s.organizations.name, isDemo: s.organizations.isDemo }).from(s.organizations).where(eq(s.organizations.id, DEMO_ORGANIZATION_ID)))[0];
  if (!org?.isDemo) throw new Error("Aucune organisation de démo marquée is_demo : rien à faire.");
  const member = (await db.select({ id: s.users.id, email: s.users.email, name: s.users.name, role: s.users.role, organizationId: s.users.organizationId }).from(s.users).where(eq(s.users.id, DEMO_MEMBER_ID)))[0];
  if (!member || member.organizationId !== org.id || member.role !== "member") throw new Error("La persona member de la démo est introuvable (ou n'est plus member) : réinitialise la démo d'abord.");

  async function status() {
    const [c] = await db.select({ n: count() }).from(s.contacts).where(and(eq(s.contacts.organizationId, org.id), eq(s.contacts.ownerId, member.id)));
    const [d] = await db.select({ n: count() }).from(s.deals).where(and(eq(s.deals.organizationId, org.id), eq(s.deals.ownerId, member.id)));
    const [t] = await db.select({ n: count() }).from(s.tasks).where(and(eq(s.tasks.organizationId, org.id), eq(s.tasks.assigneeId, member.id), eq(s.tasks.status, "open")));
    const current = (await db.select({ email: s.users.email }).from(s.users).where(eq(s.users.id, member.id)))[0].email;
    console.log(`${org.name} — ${member.name} (member) : ${current}${isReservedExampleAddress(current) ? " (adresse fictive : aucun lien de connexion ne part)" : " (adresse réelle : le lien de connexion part)"}`);
    console.log(`  contacts attribués : ${c.n} · affaires attribuées : ${d.n} · tâches ouvertes : ${t.n}`);
  }

  if (command === "status") return status();

  if (command === "attach") {
    const email = (process.argv.find((a) => a.startsWith("--email=")) ?? "").slice("--email=".length).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Usage : attach --email=<adresse réelle>");
    if (isReservedExampleAddress(email)) throw new Error("Cette adresse est réservée aux exemples : aucun lien de connexion ne partirait.");
    const taken = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, email));
    if (taken.length > 0 && taken[0].id !== member.id) throw new Error("Cette adresse est déjà celle d'un autre compte : rien n'est changé.");
    await db.update(s.users).set({ email, updatedAt: new Date() }).where(and(eq(s.users.id, member.id), eq(s.users.organizationId, org.id)));
    console.log(`✓ ${member.name} se connecte désormais avec ${email}`);
    return status();
  }

  if (command === "detach") {
    await db.update(s.users).set({ email: D.PEOPLE.thomas.email, updatedAt: new Date() }).where(and(eq(s.users.id, member.id), eq(s.users.organizationId, org.id)));
    console.log(`✓ ${member.name} reprend son adresse fictive`);
    return status();
  }

  console.error("Usage : scripts/demo-member.ts attach --email=<adresse> | status | detach");
  process.exit(2);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });

export {};
