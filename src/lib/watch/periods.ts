import type { TranslatorOf } from "@/i18n/translator";
import { PRODUCT_TIMEZONE } from "@/lib/timezone";

/**
 * Les PÉRIODES des observations de marché, telles qu'elles sont stockées
 * (`market_observations.period`) : « 2026-08-06 » (jour), « 2026-07 »
 * (mois), « 2026-T3 » (trimestre), « 2026 » (année). Une seule forme par
 * périodicité, pour que la clé (indicateur, période) soit stable d'une
 * collecte à l'autre, et un seul endroit pour la lire en français.
 */
export type Periodicity = "daily" | "monthly" | "quarterly" | "annual" | "on_change";

const pad = (n: number) => String(n).padStart(2, "0");

/** La période d'une date selon la périodicité de la série (Webstat donne une date de fin de période, jamais le libellé). */
export function periodOfDate(date: Date, periodicity: Periodicity): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  switch (periodicity) {
    case "monthly":
      return `${y}-${pad(m)}`;
    case "quarterly":
      return `${y}-T${Math.ceil(m / 3)}`;
    case "annual":
      return String(y);
    default:
      return `${y}-${pad(m)}-${pad(date.getUTCDate())}`;
  }
}

/** « 2026-Q2 » (INSEE) → « 2026-T2 » ; les autres formes passent telles quelles. */
export function normalizePeriod(raw: string): string {
  const quarter = /^(\d{4})-Q([1-4])$/.exec(raw.trim());
  if (quarter) return `${quarter[1]}-T${quarter[2]}`;
  return raw.trim();
}

/** Le premier jour de la période (AAAA-MM-JJ), pour trier et comparer ; null si la forme est inconnue. */
export function periodStart(period: string): string | null {
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(period))) return period;
  if ((m = /^(\d{4})-(\d{2})$/.exec(period))) return `${m[1]}-${m[2]}-01`;
  if ((m = /^(\d{4})-T([1-4])$/.exec(period))) return `${m[1]}-${pad((Number(m[2]) - 1) * 3 + 1)}-01`;
  if ((m = /^(\d{4})$/.exec(period))) return `${m[1]}-01-01`;
  return null;
}

/**
 * « 6 août 2026 », « juillet 2026 », « 3e trimestre 2026 », « 2026 » — la
 * période en mots, pour l'écran et pour la mention « (source, date) ».
 * Les jours et les mois viennent d'`Intl` ; le trimestre, d'un message
 * (`figures.periods.quarter`) — aucun mot en dur.
 */
export function formatPeriod(period: string, t: TranslatorOf<"figures">): string {
  let m: RegExpExecArray | null;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(period))) {
    return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: PRODUCT_TIMEZONE }).format(
      new Date(`${period}T12:00:00Z`)
    );
  }
  if ((m = /^(\d{4})-(\d{2})$/.exec(period))) {
    return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${period}-15T12:00:00Z`));
  }
  if ((m = /^(\d{4})-T([1-4])$/.exec(period))) return t("periods.quarter", { quarter: Number(m[2]), year: m[1] });
  return period;
}
