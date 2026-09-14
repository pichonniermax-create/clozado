/**
 * L'EXPIRATION d'un partage — les deux règles pures (correctif du
 * 2026-09-14 : « le lien sur partage d'affaire m'affiche “Ce lien n'est
 * plus valable” » — un lien RENVOYÉ recopiait la date d'expiration de
 * l'ancien partage, déjà passée : il naissait expiré).
 *
 * - Un renvoi ouvre une NOUVELLE fenêtre de validité, de la même durée que
 *   la première (expiration − création), comptée d'aujourd'hui ; sans
 *   expiration à l'origine, toujours sans expiration ; une durée
 *   incohérente (nulle ou négative) vaut la durée par défaut.
 * - Une date d'expiration saisie (un jour, sans heure) vaut la FIN de ce
 *   jour : choisir « aujourd'hui » ne fabrique pas un lien mort à midi.
 */
export const DEFAULT_SHARE_VALIDITY_MS = 14 * 86_400_000;
const MIN_VALIDITY_MS = 3_600_000;

export function reissuedExpiry(existing: { createdAt: Date; expiresAt: Date | null }, now = new Date()): Date | null {
  if (!existing.expiresAt) return null;
  const validity = existing.expiresAt.getTime() - existing.createdAt.getTime();
  return new Date(now.getTime() + (validity >= MIN_VALIDITY_MS ? validity : DEFAULT_SHARE_VALIDITY_MS));
}

/** « 2026-09-21 » (un champ date) → le 21 septembre à 23:59:59.999, heure locale de la personne qui saisit. */
export function endOfDayFromDateInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 23, 59, 59, 999);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Une expiration déjà passée n'est pas un partage : refusée à la création, avant toute écriture. */
export function isExpiryInPast(expiresAt: Date | null | undefined, now = new Date()): boolean {
  return Boolean(expiresAt && expiresAt.getTime() <= now.getTime());
}

/** « 2026-09-14 » — le jour local courant, pour la borne basse d'un champ date. */
export function todayInputValue(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
