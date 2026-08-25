import { parseLocalDateTime } from "@/db/queries/activities";
import { ORIGIN_UNKNOWN, ORIGIN_UNMATCHED, type MetricFilters } from "./filters";
import type { DealOutcomeFilter, DealSelection } from "./funnel";
import { LOSS_NO_REASON, LOST_FROM_CREATION } from "./losses";

/**
 * Les filtres d'une vue analytique tels qu'ils voyagent dans l'URL — les
 * mêmes noms sur tous les écrans du module et sur l'export, pour qu'un lien
 * copié garde ses filtres. Tout est validé ici : un identifiant qui n'en
 * est pas un est ignoré (jamais transmis à la base), une date mal formée
 * aussi.
 */
export type MetricSearchParams = {
  periode?: string;
  /** Bornes personnalisées « YYYY-MM-DD », incluses toutes les deux. */
  du?: string;
  au?: string;
  conseiller?: string;
  type?: string;
  pipeline?: string;
  origine?: string;
};

export const PERIOD_PRESETS = [
  { key: "30j", label: "30 derniers jours", days: 30 },
  { key: "90j", label: "90 derniers jours", days: 90 },
  { key: "12m", label: "12 derniers mois", days: 365 },
  { key: "tout", label: "Depuis le début", days: null },
] as const;

export type PeriodPresetKey = (typeof PERIOD_PRESETS)[number]["key"];

/** Sans période dans l'URL : tout l'historique — le plus d'observations possible avant de restreindre. */
export const DEFAULT_PERIOD: PeriodPresetKey = "tout";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function uuidOrUndefined(value: string | undefined): string | undefined {
  return value && UUID.test(value) ? value : undefined;
}

function dayOrUndefined(value: string | undefined): string | undefined {
  return value && DAY.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) ? value : undefined;
}

/** Le jour calendaire suivant (« 2026-08-31 » → « 2026-09-01 »). */
function nextDay(day: string): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + DAY_MS).toISOString().slice(0, 10);
}

export type ParsedMetricFilters = {
  filters: MetricFilters;
  /** Le préréglage retenu, ou « perso » quand des bornes sont posées. */
  period: PeriodPresetKey | "perso";
  /** Les paramètres nettoyés — pour reconstruire des liens qui gardent les filtres. */
  params: MetricSearchParams;
  /** Vrai dès qu'un filtre restreint la vue (période comprise). */
  active: boolean;
};

export function parseMetricFilters(raw: MetricSearchParams, now = new Date()): ParsedMetricFilters {
  const du = dayOrUndefined(raw.du);
  const au = dayOrUndefined(raw.au);
  const filters: MetricFilters = {
    ownerId: uuidOrUndefined(raw.conseiller),
    typeId: uuidOrUndefined(raw.type),
    pipelineId: uuidOrUndefined(raw.pipeline),
    originId:
      raw.origine === ORIGIN_UNKNOWN || raw.origine === ORIGIN_UNMATCHED ? raw.origine : uuidOrUndefined(raw.origine),
  };
  let period: ParsedMetricFilters["period"] = DEFAULT_PERIOD;
  if (du || au) {
    period = "perso";
    // Les jours sont lus comme des jours de Paris (même convention que les interactions), la borne haute est INCLUSE.
    if (du) filters.from = parseLocalDateTime(`${du}T00:00`) ?? undefined;
    if (au) filters.to = parseLocalDateTime(`${nextDay(au)}T00:00`) ?? undefined;
  } else {
    const preset = PERIOD_PRESETS.find((p) => p.key === raw.periode) ?? PERIOD_PRESETS.find((p) => p.key === DEFAULT_PERIOD)!;
    period = preset.key;
    if (preset.days) filters.from = new Date(now.getTime() - preset.days * DAY_MS);
  }
  const params: MetricSearchParams = {
    periode: period !== "perso" && period !== DEFAULT_PERIOD ? period : undefined,
    du,
    au,
    conseiller: filters.ownerId,
    type: filters.typeId,
    pipeline: filters.pipelineId,
    origine: filters.originId,
  };
  const active = Object.values(params).some(Boolean);
  return { filters, period, params, active };
}

/** Reconstruit une chaîne de requête à partir des paramètres nettoyés, avec des remplacements (undefined = retirer). */
export function metricQueryString<P extends Record<string, string | undefined>>(params: P, over: Partial<P> = {}): string {
  const merged: Record<string, string | undefined> = { ...params, ...over };
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) if (value) sp.set(key, value);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/**
 * Ce qu'un clic sur un pas du funnel ajoute à l'URL de la liste des
 * affaires, en plus des filtres communs : `cohorte` (`lead` : la période
 * porte sur l'arrivée du lead ; sinon sur la création de l'affaire),
 * `atteint` (a atteint cette étape), `jusqua` (au plus loin dans cette
 * étape, pas gagnée), `issue` (`gagnee`, `perdue`, `en-cours`). Validés
 * comme le reste : un identifiant qui n'en est pas un est ignoré.
 */
export type DealSelectionParams = MetricSearchParams & {
  cohorte?: string;
  atteint?: string;
  jusqua?: string;
  issue?: string;
  /** Analyse des pertes (`cohorte=perte`) : le motif au moment de la perte (identifiant ou `sans-motif`) et l'étape de départ (identifiant ou `creation`). */
  motif?: string;
  depuis?: string;
};

const OUTCOMES: DealOutcomeFilter[] = ["gagnee", "perdue", "en-cours"];

export type ParsedDealSelection = {
  parsed: ParsedMetricFilters;
  selection: DealSelection;
  /** Les paramètres nettoyés, sélection comprise — pour les liens qui la gardent. */
  params: DealSelectionParams;
  /** Vrai dès qu'un paramètre ANALYTIQUE est posé (période, type, origine, cohorte, étape atteinte, issue) — pas le pipeline ni le conseiller, filtres natifs de la liste. */
  analytic: boolean;
};

export function parseDealSelection(raw: DealSelectionParams, now = new Date()): ParsedDealSelection {
  const parsed = parseMetricFilters(raw, now);
  const cohort = raw.cohorte === "lead" ? "lead" : raw.cohorte === "perte" ? "perte" : "creation";
  const reachedStageId = uuidOrUndefined(raw.atteint);
  const furthestStageId = uuidOrUndefined(raw.jusqua);
  const outcome = OUTCOMES.find((o) => o === raw.issue);
  const lossReasonId = cohort === "perte" ? (raw.motif === LOSS_NO_REASON ? LOSS_NO_REASON : uuidOrUndefined(raw.motif)) : undefined;
  const lostFromStageId =
    cohort === "perte" ? (raw.depuis === LOST_FROM_CREATION ? LOST_FROM_CREATION : uuidOrUndefined(raw.depuis)) : undefined;
  const selection: DealSelection = { filters: parsed.filters, cohort, reachedStageId, furthestStageId, outcome, lossReasonId, lostFromStageId };
  const params: DealSelectionParams = {
    ...parsed.params,
    cohorte: cohort === "creation" ? undefined : cohort,
    atteint: reachedStageId,
    jusqua: furthestStageId,
    issue: outcome,
    motif: lossReasonId,
    depuis: lostFromStageId,
  };
  const p = parsed.params;
  const analytic = Boolean(
    p.periode || p.du || p.au || p.type || p.origine || cohort !== "creation" || reachedStageId || furthestStageId || outcome
  );
  return { parsed, selection, params, analytic };
}
