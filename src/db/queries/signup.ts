import { randomUUID } from "crypto";
import { eq, like } from "drizzle-orm";
import { db } from "@/db";
import { organizations, siteKeys, users } from "@/db/schema";
import { generateSiteKey } from "@/lib/acquisition/keys";
import { buildDefaultPipelineInserts } from "./deal-statuses";

/**
 * Inscription libre : crée une organisation ET son premier utilisateur,
 * qui en devient l'admin.
 *
 * C'EST LE SEUL ENDROIT DU PRODUIT QUI ÉCRIT DANS `users` SANS SESSION.
 * Il n'accepte donc rien d'autre qu'un nom d'organisation et un email —
 * jamais un rôle ni un `organizationId` fournis par l'appelant : le rôle
 * est forcé à `admin` et l'organisation est celle qu'on vient de créer.
 * Aucun chemin ne permet de se rattacher à une organisation existante.
 *
 * Ne déclenche AUCUNE connexion : la ligne `users` est simplement créée
 * avant l'envoi du lien magique, de sorte que le garde-fou de `src/auth.ts`
 * (« seul un email déjà présent en base peut se connecter ») reste vrai tel
 * quel — on ne l'affaiblit pas, on le satisfait en amont.
 */

export type SignUpResult =
  | { ok: true; organizationId: string; slug: string }
  | { ok: false; reason: "email_taken" };

/** ASCII, minuscules, tirets — `organizations.slug` est unique en base. */
function slugify(input: string): string {
  const base = input
    .normalize("NFD")
    // Retire les diacritiques décomposés par NFD (« Crédit » → « credit »).
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "espace";
}

/**
 * Suffixe numérique en cas de collision. Une course entre deux inscriptions
 * simultanées sur le même nom reste possible : la contrainte d'unicité en
 * base tranche alors, et l'appelant reçoit l'erreur — c'est le comportement
 * voulu, mieux vaut échouer que produire deux organisations homonymes.
 */
async function availableSlug(name: string): Promise<string> {
  const base = slugify(name);
  const taken = new Set(
    (
      await db
        .select({ slug: organizations.slug })
        .from(organizations)
        .where(like(organizations.slug, `${base}%`))
    ).map((r) => r.slug)
  );
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${randomUUID().slice(0, 8)}`;
}

export async function createOrganizationWithAdmin(input: {
  organizationName: string;
  email: string;
}): Promise<SignUpResult> {
  const email = input.email.trim().toLowerCase();
  const name = input.organizationName.trim();

  // Vérifié ici EN PLUS de la contrainte d'unicité sur `users.email` : on
  // veut distinguer « cet email a déjà un compte » (l'appelant enverra
  // alors un simple lien de connexion) d'une vraie erreur d'écriture.
  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) return { ok: false, reason: "email_taken" };

  const organizationId = randomUUID();
  const slug = await availableSlug(name);

  // Un seul lot atomique — comme `createDealShare` : le driver neon-http ne
  // supporte pas `db.transaction()`. Une organisation sans admin, sans son
  // pipeline ou sans ses statuts d'affaire, serait un état inutilisable.
  await db.batch([
    db.insert(organizations).values({ id: organizationId, name, slug }),
    db.insert(users).values({ email, role: "admin", organizationId }),
    ...buildDefaultPipelineInserts(organizationId),
    // La clé de site publique de l'organisation (collecte des visites) — dès la naissance.
    db.insert(siteKeys).values({ organizationId, key: generateSiteKey() }),
  ]);

  return { ok: true, organizationId, slug };
}
