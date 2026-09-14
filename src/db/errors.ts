/**
 * Les erreurs du pilote Postgres, reconnues par leur CODE (Drizzle enveloppe
 * l'erreur : le code vit dans `cause.code`, parfois sur l'erreur elle-même).
 */
function postgresCode(error: unknown): string | null {
  const direct = (error as { code?: unknown })?.code;
  if (typeof direct === "string") return direct;
  const cause = (error as { cause?: { code?: unknown } })?.cause;
  return typeof cause?.code === "string" ? cause.code : null;
}

/**
 * « La table n'existe pas » (42P01) — le cas d'une migration RÉDIGÉE mais
 * pas encore APPLIQUÉE sur la base partagée (dev et prod partagent la base,
 * une migration n'y passe jamais sans accord : docs/module-demo.md §1.5).
 * Une fonctionnalité qui dépend d'une table nouvelle se dégrade proprement
 * en attendant, elle ne casse pas l'écran qui l'héberge.
 */
export function isUndefinedTable(error: unknown): boolean {
  return postgresCode(error) === "42P01";
}
