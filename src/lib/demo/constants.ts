import { createHash } from "crypto";

/**
 * L'organisation de démonstration (docs/module-demo.md §1.6) — ses
 * identifiants sont FIXES : une réinitialisation supprime la ligne
 * `organizations` (la cascade emporte tout) puis la recrée à l'identique,
 * et tout ce qui la désigne de l'extérieur (cookie d'organisation active
 * du super admin, session de visite, journal `demo_resets`) reste valable.
 */
export const DEMO_SLUG = "demo";

/** Le domaine du cabinet fictif — un TLD réservé par l'IETF (RFC 6761) : rien ne le route, jamais. */
export const DEMO_DOMAIN = "vasseur-courtage.example";

/**
 * Un identifiant uuid v4 (forme) dérivé d'un nom : le même nom donne toujours
 * le même identifiant — c'est ce qui rend le jeu de données idempotent
 * d'une création à l'autre. Version 4 et variante RFC posées à la main : la
 * page de désinscription, par exemple, exige un uuid v4 syntaxique.
 */
export function demoId(name: string): string {
  const hex = createHash("sha256").update(`clozado-demo:${name}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${(8 + (parseInt(hex[16], 16) % 4)).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export const DEMO_ORGANIZATION_ID = demoId("organization");
/** La persona du visiteur : la courtière fondatrice, admin de l'organisation. */
export const DEMO_ADMIN_ID = demoId("user:claire");
export const DEMO_MEMBER_ID = demoId("user:thomas");

/**
 * Les domaines réservés aux exemples et aux tests (RFC 2606 et RFC 6761) :
 * le transport refuse d'écrire à l'un d'eux, quel que soit le chemin
 * d'envoi — la ceinture sous le blocage par organisation (§1.2). Personne
 * n'a de raison d'écrire à une adresse qui n'existe pas par construction.
 */
const RESERVED_EXAMPLE_DOMAINS = ["example.com", "example.net", "example.org"];
const RESERVED_EXAMPLE_TLDS = [".example", ".invalid", ".test", ".localhost"];

export function isReservedExampleAddress(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .replace(/>$/, "");
  if (RESERVED_EXAMPLE_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return true;
  return RESERVED_EXAMPLE_TLDS.some((tld) => domain.endsWith(tld));
}

/** Le préfixe des identifiants fournisseur d'un envoi SIMULÉ (aucun appel à Resend) — reconnu par les écrans. */
export const DEMO_PROVIDER_PREFIX = "demo:";

export function isSimulatedProviderId(providerMessageId: string | null | undefined): boolean {
  return Boolean(providerMessageId && providerMessageId.startsWith(DEMO_PROVIDER_PREFIX));
}
