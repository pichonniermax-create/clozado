import type { OrgScopeUser } from "@/lib/session";
import { METRICS, type MetricDefinition } from "./definitions";
import {
  commissionSettlementDelay,
  creationToWonDelay,
  leadToFirstContactDelay,
  shareResponseDelay,
  stageDurations,
  stagePairDelays,
  type StageDuration,
  type StagePairDelay,
} from "./durations";
import type { MetricFilters } from "./filters";
import type { DurationStat } from "./types";

/**
 * La vue « délais et durées » entière, en un seul objet : l'écran l'affiche,
 * l'export CSV (étape 6) l'écrira — jamais deux listes d'indicateurs à
 * garder synchronisées. Les six calculs partent ensemble ; chacun est
 * borné par l'organisation et porte les mêmes filtres.
 */
export type CycleDelay = { metric: MetricDefinition; stat: DurationStat };

export type DelaysReport = {
  /** Les délais du cycle, dans l'ordre de la vie d'une affaire : lead, signature, partenaire, commission. */
  cycle: CycleDelay[];
  stages: StageDuration[];
  pairs: StagePairDelay[];
};

export async function delaysReport(user: OrgScopeUser, filters: MetricFilters = {}): Promise<DelaysReport> {
  const [leadToFirstContact, creationToWon, shareResponse, commissionSettlement, stages, pairs] = await Promise.all([
    leadToFirstContactDelay(user, filters),
    creationToWonDelay(user, filters),
    shareResponseDelay(user, filters),
    commissionSettlementDelay(user, filters),
    stageDurations(user, filters),
    stagePairDelays(user, filters),
  ]);
  return {
    cycle: [
      { metric: METRICS.lead_to_first_contact, stat: leadToFirstContact },
      { metric: METRICS.creation_to_won, stat: creationToWon },
      { metric: METRICS.share_response_delay, stat: shareResponse },
      { metric: METRICS.commission_settlement_delay, stat: commissionSettlement },
    ],
    stages,
    pairs,
  };
}

function allStats(report: DelaysReport): DurationStat[] {
  return [...report.cycle.map((c) => c.stat), ...report.stages, ...report.pairs];
}

/** Au moins un indicateur du rapport s'affiche. */
export function reportShowsAnything(report: DelaysReport): boolean {
  return allStats(report).some((s) => !s.hidden);
}

/** Le rapport contient de la matière — des observations, closes ou en cours, ou des lignes écartées — même si rien ne passe encore le seuil. */
export function reportHasAnyData(report: DelaysReport): boolean {
  return allStats(report).some((s) => s.n > 0 || s.pending > 0 || s.excludedReconstructed > 0 || s.excludedUnknown > 0);
}
