/**
 * Le fuseau par défaut du produit — celui d'une organisation qui n'en a
 * pas choisi d'autre (`organizations.timezone`). Le serveur (Vercel) est en
 * UTC : tout ce qui se lit ou se saisit comme une heure de la journée —
 * échéances des tâches, date d'une interaction, affichage des dates — est
 * rapporté au fuseau de l'ORGANISATION, jamais à celui du serveur.
 */
export const PRODUCT_TIMEZONE = "Europe/Paris";

/** Un identifiant IANA connu du moteur (« Europe/Paris », « America/Montreal ») — la liste vient d'`Intl`, pas d'un fichier. */
export function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || !value) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function toTimeZone(value: unknown): string {
  return isTimeZone(value) ? value : PRODUCT_TIMEZONE;
}

/** Les fuseaux proposés au choix — ceux que le moteur connaît, triés. */
export function listTimeZones(): string[] {
  return Intl.supportedValuesOf("timeZone");
}

/** « 2026-08-26 » : la date du jour dans un fuseau (en-CA donne AAAA-MM-JJ directement). */
export function todayInTimeZone(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Le décalage (minutes) d'un fuseau par rapport à UTC à un instant donné. */
export function timezoneOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/**
 * « 2026-08-24T10:30 » saisi comme une heure locale du fuseau → l'instant
 * UTC correspondant. Vide ou invalide → null (= maintenant, décidé par
 * l'appelant).
 */
export function parseLocalDateTime(value: string | null | undefined, timeZone: string): Date | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const naive = new Date(`${trimmed.length === 16 ? `${trimmed}:00` : trimmed}Z`);
  if (Number.isNaN(naive.getTime())) return null;
  const offset = timezoneOffsetMinutes(timeZone, naive);
  return new Date(naive.getTime() - offset * 60 * 1000);
}
