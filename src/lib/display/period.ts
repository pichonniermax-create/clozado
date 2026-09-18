import { PERIOD_PRESETS, type MetricSearchParams } from "@/lib/metrics/search-params";
import { PREF, type Preferences } from "@/db/queries/preferences";

/**
 * LA PÉRIODE PARTAGÉE (lot 1, étape 2) — un seul paramètre (`periode`, ou
 * les bornes `du`/`au`), un seul défaut, un seul souvenir. Le tableau de
 * bord et l'analytique avaient chacun le leur : passer de l'un à l'autre
 * changeait silencieusement la fenêtre de temps.
 *
 * Ordre de priorité, toujours le même :
 * 1. l'ADRESSE — si elle porte une période, c'est elle (un lien partagé
 *    montre la même chose à tout le monde) ;
 * 2. la MÉMOIRE de la personne, dans cette organisation ;
 * 3. le défaut du produit (90 jours).
 */
export type PeriodChoice = { periode?: string; du?: string; au?: string };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Ce qui est acceptable comme période mémorisée — un préréglage connu, ou des bornes bien formées. */
export function parsePeriodChoice(value: unknown): PeriodChoice | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const du = typeof raw.du === "string" && DAY.test(raw.du) ? raw.du : undefined;
  const au = typeof raw.au === "string" && DAY.test(raw.au) ? raw.au : undefined;
  if (du || au) return { du, au };
  const periode = typeof raw.periode === "string" && PERIOD_PRESETS.some((p) => p.key === raw.periode) ? raw.periode : undefined;
  return periode ? { periode } : undefined;
}

/** La période retenue pour CET écran : celle de l'adresse, sinon celle dont la personne se souvient. */
export function periodFromPreferences(raw: MetricSearchParams, preferences: Preferences): PeriodChoice {
  if (raw.periode || raw.du || raw.au) return { periode: raw.periode, du: raw.du, au: raw.au };
  return parsePeriodChoice(preferences.get(PREF.period)) ?? {};
}

/** Les paramètres d'un écran, période mémorisée appliquée — à passer tels quels à `parseMetricFilters`. */
export function withRememberedPeriod<T extends MetricSearchParams>(raw: T, preferences: Preferences): T {
  return { ...raw, ...periodFromPreferences(raw, preferences) };
}
