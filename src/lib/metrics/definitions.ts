/**
 * LE registre des métriques — une seule définition par indicateur, en
 * français, consommée par tous les écrans et par l'export : jamais un
 * calcul refait autrement dans une page (le projet a déjà payé une liste
 * de chiffres dupliquée à trois endroits). Chaque entrée dit ce que la
 * métrique mesure exactement, ce qu'elle exclut, et ce qui se passe quand
 * les données manquent. Le calcul lui-même vit dans les fichiers voisins
 * (`durations.ts`…), un par famille, et lit ce registre.
 */

/** En dessous de ce nombre d'observations, un indicateur est MASQUÉ, jamais affiché. */
export const MIN_OBSERVATIONS = 5;

export type MetricUnit = "days" | "count" | "ratio" | "euros";

export type MetricDefinition = {
  id: string;
  label: string;
  unit: MetricUnit;
  /** La définition exacte, telle qu'affichée à l'écran. */
  definition: string;
  /** Ce que la métrique écarte. */
  excludes: string;
  /** Ce que l'écran dit quand il n'y a pas (encore) de quoi calculer. */
  whenInsufficient: string;
  minObservations: number;
};

const INSUFFICIENT = `Masqué en dessous de ${MIN_OBSERVATIONS} observations ; l'écran indique combien il en manque.`;

export const METRICS = {
  stage_duration: {
    id: "stage_duration",
    label: "Temps passé par étape",
    unit: "days",
    definition:
      "Pour chaque étape du pipeline, durée entre l'entrée d'une affaire dans l'étape et sa sortie (le passage suivant), médiane et moyenne sur les passages terminés. Une affaire qui revisite une étape compte un passage par visite.",
    excludes:
      "Le passage en cours (l'affaire y est encore) ; les lignes reconstituées après coup (ligne d'étape initiale déduite de la date de création) — comptées à part, jamais dans la durée.",
    whenInsufficient: INSUFFICIENT,
    minObservations: MIN_OBSERVATIONS,
  },
  creation_to_won: {
    id: "creation_to_won",
    label: "Délai création → signature",
    unit: "days",
    definition:
      "Durée entre la création de l'affaire et sa PREMIÈRE entrée dans une étape marquée « gagné », médiane et moyenne sur les affaires signées.",
    excludes:
      "Les affaires jamais gagnées ; une entrée en étape gagnée reconstituée après coup ; une organisation sans étape marquée « gagné » n'a pas de signature mesurable.",
    whenInsufficient: INSUFFICIENT,
    minObservations: MIN_OBSERVATIONS,
  },
  stage_pair_delay: {
    id: "stage_pair_delay",
    label: "Délai entre deux étapes consécutives",
    unit: "days",
    definition:
      "Pour chaque paire d'étapes qui se suivent dans un pipeline, durée entre la première entrée d'une affaire dans la première et sa première entrée dans la seconde, sur les affaires qui ont atteint les deux — médiane et moyenne.",
    excludes:
      "Les affaires qui n'ont pas atteint la seconde étape ; les paires non consécutives ; les entrées reconstituées.",
    whenInsufficient: INSUFFICIENT,
    minObservations: MIN_OBSERVATIONS,
  },
  share_response_delay: {
    id: "share_response_delay",
    label: "Délai partage → réponse du partenaire",
    unit: "days",
    definition:
      "Durée entre l'envoi d'un partage et la réponse du partenaire (acceptation ou refus). Un lien renvoyé ne compte pas comme un nouveau partage : la durée part du PREMIER envoi de la chaîne.",
    excludes:
      "Les partages sans réponse (en attente, révoqués sans réponse, expirés) ; les partages remplacés par un renvoi (seul le dernier de la chaîne porte la réponse).",
    whenInsufficient: INSUFFICIENT,
    minObservations: MIN_OBSERVATIONS,
  },
  commission_settlement_delay: {
    id: "commission_settlement_delay",
    label: "Délai commission confirmée → réglée",
    unit: "days",
    definition:
      "Durée entre la confirmation d'une commission et la déclaration de son règlement, médiane et moyenne sur les commissions réglées dont les deux dates sont connues.",
    excludes:
      "Les commissions non réglées ; celles dont la date de confirmation est inconnue (confirmées avant que la date soit journalisée) — comptées à part, jamais remplacées par une date plausible.",
    whenInsufficient: INSUFFICIENT,
    minObservations: MIN_OBSERVATIONS,
  },
  lead_to_first_contact: {
    id: "lead_to_first_contact",
    label: "Délai lead → premier contact effectif",
    unit: "days",
    definition:
      "Durée entre l'arrivée d'un lead et la première interaction consignée avec la personne (appel, email ou rendez-vous — pas une note), médiane et moyenne.",
    excludes:
      "Les leads sans interaction consignée ; les notes (elles ne sont pas un contact) ; les contacts arrivés autrement que par un lead.",
    whenInsufficient:
      "Indisponible tant que l'entrée des leads n'est pas branchée (migration B du module analytique) ; ensuite, " +
      INSUFFICIENT.charAt(0).toLowerCase() +
      INSUFFICIENT.slice(1),
    minObservations: MIN_OBSERVATIONS,
  },
} as const satisfies Record<string, MetricDefinition>;

export type MetricId = keyof typeof METRICS;

/** La liste, dans l'ordre d'affichage. */
export const METRIC_LIST: MetricDefinition[] = Object.values(METRICS);
