import { metricQueryString, type DealSelectionParams, type ParsedMetricFilters } from "@/lib/metrics";

/**
 * Un lien vers la liste des affaires d'un pipeline, avec les filtres de
 * l'écran analytique et la sélection d'une ligne (pas du funnel, motif de
 * perte…) — la liste montrera exactement ce qui est compté, par la même
 * condition que l'agrégat (`dealSelectionCondition`).
 */
export function dealsListHref(parsed: ParsedMetricFilters, pipelineId: string, over: Partial<DealSelectionParams> = {}): string {
  const qs = metricQueryString<DealSelectionParams>({ ...parsed.params, pipeline: undefined }, over);
  return `/affaires?vue=liste&pipeline=${pipelineId}${qs ? `&${qs.slice(1)}` : ""}`;
}
