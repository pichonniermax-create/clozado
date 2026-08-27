/**
 * Jeu de données jetable du chantier engagement (étape 2) : une organisation
 * `_engage-test`, une cible « tous », trois contacts (une adresse réelle
 * autorisée, un simulateur de rejet du fournisseur, un contact sans
 * adresse), une newsletter aboutie. `create` / `destroy` (cascade).
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const SLUG = "_engage-test";
export const ALLOWED_REAL_ADDRESS = "pichonniermax@gmail.com";

async function main() {
  const mode = process.argv[2];
  const { db } = await import("@/db");
  const { contacts, mailTargets, newsletterBlocks, newsletters, organizations } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");

  const existing = await db.query.organizations.findFirst({ where: eq(organizations.slug, SLUG) });
  if (mode === "destroy") {
    if (existing) {
      await db.delete(organizations).where(eq(organizations.id, existing.id));
      console.log("détruite :", existing.id);
    } else console.log("rien à détruire");
    return;
  }
  if (existing) await db.delete(organizations).where(eq(organizations.id, existing.id));
  const [org] = await db
    .insert(organizations)
    .values({
      name: "Cabinet Engagement (test)",
      slug: SLUG,
      senderName: "Cabinet Engagement",
      senderEmail: "contact@cabinet-engagement.example",
      postalAddress: "12 rue des Lilas\n69001 Lyon",
      legalMention: "SARL au capital de 10 000 € · ORIAS 12 345 678",
      country: "FR",
      defaultLocale: "fr",
    })
    .returning();
  const [target] = await db.insert(mailTargets).values({ organizationId: org.id, slug: "tous", label: "Tous les contacts", kind: "segment", criteria: {}, editorialVoice: "Direct et chaleureux" }).returning();
  const rows = await db
    .insert(contacts)
    .values([
      { organizationId: org.id, kind: "person", name: "Max Pichonnier", firstName: "Max", lastName: "Pichonnier", email: ALLOWED_REAL_ADDRESS },
      { organizationId: org.id, kind: "person", name: "Rebond Simulé", firstName: "Rebond", lastName: "Simulé", email: "bounced@resend.dev" },
      { organizationId: org.id, kind: "person", name: "Sans Adresse", firstName: "Sans", lastName: "Adresse", email: null },
    ])
    .returning();
  const [nl] = await db
    .insert(newsletters)
    .values({ organizationId: org.id, title: "Preuve engagement", targetId: target.id, subject: "Trois chiffres pour préparer la rentrée", preheader: "Ce que le marché dit cette semaine", topics: ["rentrée"] })
    .returning();
  await db.insert(newsletterBlocks).values([
    { newsletterId: nl.id, type: "titre", position: 0, payload: { text: "Préparer la rentrée", level: 1, eyebrow: "Le point du mois" } },
    { newsletterId: nl.id, type: "texte", position: 1, payload: { text: "Voici ce qu'il faut retenir avant de planifier vos rendez-vous.\n\nDeux paragraphes, un seul bloc." } },
    { newsletterId: nl.id, type: "bouton", position: 2, payload: { label: "Prendre rendez-vous", url: "https://example.com/rendez-vous" } },
  ]);
  console.log(JSON.stringify({ organizationId: org.id, targetId: target.id, newsletterId: nl.id, contactIds: rows.map((r) => r.id) }));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
