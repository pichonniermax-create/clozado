/**
 * LE registre des métriques — une seule définition par indicateur,
 * consommée par tous les écrans et par l'export : jamais un
 * calcul refait autrement dans une page (le projet a déjà payé une liste
 * de chiffres dupliquée à trois endroits). Chaque entrée dit ce que la
 * métrique mesure exactement, ce qu'elle exclut, ce qui se passe quand
 * les données manquent, ce qui crée une observation, et comment les
 * filtres communs s'y appliquent. Le calcul lui-même vit dans les fichiers
 * voisins (`durations.ts`, `funnel.ts`…), un par famille, et lit ce registre.
 */

import type { Messages } from "@/i18n/messages";

/** En dessous de ce nombre d'observations, un indicateur est MASQUÉ, jamais affiché. */
export const MIN_OBSERVATIONS = 5;

export type MetricUnit = "days" | "count" | "ratio" | "euros";

/** La famille d'une métrique — l'écran qui la porte. */
export type MetricFamily = "delays" | "funnel" | "losses" | "partners" | "volumes";

/**
 * Les TEXTES d'une métrique — libellé, définition exacte telle qu'affichée,
 * ce qu'elle écarte, ce que l'écran dit quand il n'y a pas de quoi
 * calculer, ce qui crée une observation, comment les filtres s'appliquent —
 * vivent dans les messages (`metrics.definitions.<id>.*`, chantier i18n) :
 * `t(\`definitions.${metric.id}.label\`)` avec le traducteur du namespace
 * `metrics`. Le registre ne garde que ce qui gouverne le calcul.
 */
export type MetricDefinition = {
  id: keyof Messages["metrics"]["definitions"];
  unit: MetricUnit;
  family: MetricFamily;
  minObservations: number;
};


export const METRICS = {
  stage_duration: {
    id: "stage_duration",
    unit: "days",
    family: "delays",
    minObservations: MIN_OBSERVATIONS,
  },
  creation_to_won: {
    id: "creation_to_won",
    unit: "days",
    family: "delays",
    minObservations: MIN_OBSERVATIONS,
  },
  stage_pair_delay: {
    id: "stage_pair_delay",
    unit: "days",
    family: "delays",
    minObservations: MIN_OBSERVATIONS,
  },
  share_response_delay: {
    id: "share_response_delay",
    unit: "days",
    family: "delays",
    minObservations: MIN_OBSERVATIONS,
  },
  commission_settlement_delay: {
    id: "commission_settlement_delay",
    unit: "days",
    family: "delays",
    minObservations: MIN_OBSERVATIONS,
  },
  lead_to_first_contact: {
    id: "lead_to_first_contact",
    unit: "days",
    family: "delays",
    minObservations: MIN_OBSERVATIONS,
  },

  // --- Le funnel : la chaîne continue, de la visite à la signature ---------
  funnel_visitors: {
    id: "funnel_visitors",
    unit: "count",
    family: "funnel",
    minObservations: MIN_OBSERVATIONS,
  },
  funnel_simulations_started: {
    id: "funnel_simulations_started",
    unit: "count",
    family: "funnel",
    minObservations: MIN_OBSERVATIONS,
  },
  funnel_simulations_completed: {
    id: "funnel_simulations_completed",
    unit: "count",
    family: "funnel",
    minObservations: MIN_OBSERVATIONS,
  },
  funnel_leads: {
    id: "funnel_leads",
    unit: "count",
    family: "funnel",
    minObservations: MIN_OBSERVATIONS,
  },
  funnel_contacted: {
    id: "funnel_contacted",
    unit: "count",
    family: "funnel",
    minObservations: MIN_OBSERVATIONS,
  },
  funnel_deals_from_leads: {
    id: "funnel_deals_from_leads",
    unit: "count",
    family: "funnel",
    minObservations: MIN_OBSERVATIONS,
  },
  funnel_won: {
    id: "funnel_won",
    unit: "count",
    family: "funnel",
    minObservations: MIN_OBSERVATIONS,
  },
  funnel_stage_reached: {
    id: "funnel_stage_reached",
    unit: "count",
    family: "funnel",
    minObservations: MIN_OBSERVATIONS,
  },
  funnel_stage_leak: {
    id: "funnel_stage_leak",
    unit: "count",
    family: "funnel",
    minObservations: MIN_OBSERVATIONS,
  },
  funnel_conversion_rate: {
    id: "funnel_conversion_rate",
    unit: "ratio",
    family: "funnel",
    minObservations: MIN_OBSERVATIONS,
  },
  funnel_by_origin: {
    id: "funnel_by_origin",
    unit: "count",
    family: "funnel",
    minObservations: MIN_OBSERVATIONS,
  },

  // --- Les pertes : pourquoi, d'où, qui, quoi — et combien ------------------
  lost_deal: {
    id: "lost_deal",
    unit: "count",
    family: "losses",
    minObservations: MIN_OBSERVATIONS,
  },
  loss_breakdown: {
    id: "loss_breakdown",
    unit: "ratio",
    family: "losses",
    minObservations: MIN_OBSERVATIONS,
  },
  loss_rate: {
    id: "loss_rate",
    unit: "ratio",
    family: "losses",
    minObservations: MIN_OBSERVATIONS,
  },

  // --- Les partenaires et les commissions ----------------------------------
  partner_shares: {
    id: "partner_shares",
    unit: "count",
    family: "partners",
    minObservations: MIN_OBSERVATIONS,
  },
  partner_acceptance_rate: {
    id: "partner_acceptance_rate",
    unit: "ratio",
    family: "partners",
    minObservations: MIN_OBSERVATIONS,
  },
  partner_response_delay: {
    id: "partner_response_delay",
    unit: "days",
    family: "partners",
    minObservations: MIN_OBSERVATIONS,
  },
  partner_transformation_rate: {
    id: "partner_transformation_rate",
    unit: "ratio",
    family: "partners",
    minObservations: MIN_OBSERVATIONS,
  },
  partner_commissions: {
    id: "partner_commissions",
    unit: "euros",
    family: "partners",
    minObservations: MIN_OBSERVATIONS,
  },
  commissions_outstanding: {
    id: "commissions_outstanding",
    unit: "euros",
    family: "partners",
    minObservations: MIN_OBSERVATIONS,
  },
  commissions_aging: {
    id: "commissions_aging",
    unit: "euros",
    family: "partners",
    minObservations: MIN_OBSERVATIONS,
  },

  // --- Les volumes : ce qui entre, ce qui se signe, ce qui est en cours ---
  deals_created: {
    id: "deals_created",
    unit: "count",
    family: "volumes",
    minObservations: MIN_OBSERVATIONS,
  },
  deals_won: {
    id: "deals_won",
    unit: "count",
    family: "volumes",
    minObservations: MIN_OBSERVATIONS,
  },
  won_amount: {
    id: "won_amount",
    unit: "euros",
    family: "volumes",
    minObservations: MIN_OBSERVATIONS,
  },
  pipeline_open: {
    id: "pipeline_open",
    unit: "euros",
    family: "volumes",
    minObservations: MIN_OBSERVATIONS,
  },
} as const satisfies Record<string, MetricDefinition>;

export type MetricId = keyof typeof METRICS;

/** La liste complète, dans l'ordre d'affichage. */
export const METRIC_LIST: MetricDefinition[] = Object.values(METRICS);

/** Les définitions d'une famille — ce qu'un écran affiche sous ses chiffres. */
export function metricsOfFamily(family: MetricFamily): MetricDefinition[] {
  return METRIC_LIST.filter((m) => m.family === family);
}
