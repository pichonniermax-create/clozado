/**
 * LE registre des métriques — une seule définition par indicateur, en
 * français, consommée par tous les écrans et par l'export : jamais un
 * calcul refait autrement dans une page (le projet a déjà payé une liste
 * de chiffres dupliquée à trois endroits). Chaque entrée dit ce que la
 * métrique mesure exactement, ce qu'elle exclut, ce qui se passe quand
 * les données manquent, ce qui crée une observation, et comment les
 * filtres communs s'y appliquent. Le calcul lui-même vit dans les fichiers
 * voisins (`durations.ts`, `funnel.ts`…), un par famille, et lit ce registre.
 */

/** En dessous de ce nombre d'observations, un indicateur est MASQUÉ, jamais affiché. */
export const MIN_OBSERVATIONS = 5;

export type MetricUnit = "days" | "count" | "ratio" | "euros";

/** La famille d'une métrique — l'écran qui la porte. */
export type MetricFamily = "delays" | "funnel";

export type MetricDefinition = {
  id: string;
  label: string;
  unit: MetricUnit;
  family: MetricFamily;
  /** La définition exacte, telle qu'affichée à l'écran. */
  definition: string;
  /** Ce que la métrique écarte. */
  excludes: string;
  /** Ce que l'écran dit quand il n'y a pas (encore) de quoi calculer. */
  whenInsufficient: string;
  /** Ce qui crée une observation — ce que l'écran dit pour que l'indicateur apparaisse. */
  howToFeed: string;
  /** Comment les filtres communs (période, conseiller, type, pipeline, origine) s'appliquent. */
  filters: string;
  minObservations: number;
};

const INSUFFICIENT = `Masqué en dessous de ${MIN_OBSERVATIONS} observations ; l'écran indique combien il en manque.`;
/** Un compte s'affiche toujours (c'est un fait) ; seul le taux qui en découle est soumis au seuil. */
const COUNT_ALWAYS_SHOWN = `Le nombre s'affiche toujours — c'est un fait, pas une statistique. Le taux de passage calculé à partir de ce pas est masqué tant que le pas précédent compte moins de ${MIN_OBSERVATIONS} observations.`;
const DEAL_FILTERS =
  "Conseiller, type, pipeline et origine : ceux de l'affaire telle qu'elle est aujourd'hui (les réaffectations ne sont pas historisées).";
const UPSTREAM_FILTERS =
  "Période : sur l'événement. Origine : celle transmise par la page (rattachée à une origine configurée, ou « à rapprocher »). Conseiller : sans objet — une visite n'est rattachée à personne ; avec ce filtre, le pas est sans objet. Type et pipeline : sans effet (rien n'est encore une affaire).";
const COLLECT_TO_FEED = "Poser l'extrait JavaScript sur le site (Marque & réglages → Collecte) : chaque chargement de page équipée compte.";

export const METRICS = {
  stage_duration: {
    id: "stage_duration",
    label: "Temps passé par étape",
    unit: "days",
    family: "delays",
    definition:
      "Pour chaque étape intermédiaire du pipeline, durée entre l'entrée d'une affaire dans l'étape et sa sortie (le passage suivant), médiane et moyenne sur les passages terminés. Une affaire qui revisite une étape compte un passage par visite.",
    excludes:
      "Le passage en cours (l'affaire y est encore — compté à part) ; les lignes reconstituées après coup (ligne d'étape initiale déduite de la date de création) — comptées à part, jamais dans la durée ; les étapes finales (gagné, perdu) : une affaire n'en sort pas, le temps qu'on y passe ne mesure rien.",
    whenInsufficient: INSUFFICIENT,
    howToFeed:
      "Une observation = un passage terminé : déplacer une affaire vers une autre étape (kanban ou fiche) clôt le passage précédent.",
    filters: `Période : sur la fin du passage. ${DEAL_FILTERS}`,
    minObservations: MIN_OBSERVATIONS,
  },
  creation_to_won: {
    id: "creation_to_won",
    label: "Délai création → signature",
    unit: "days",
    family: "delays",
    definition:
      "Durée entre la création de l'affaire et sa PREMIÈRE entrée dans une étape marquée « gagné », médiane et moyenne sur les affaires signées.",
    excludes:
      "Les affaires jamais gagnées ; une entrée en étape gagnée reconstituée après coup ; une organisation sans étape marquée « gagné » n'a pas de signature mesurable.",
    whenInsufficient: INSUFFICIENT,
    howToFeed: "Une observation = une affaire entrée dans l'étape marquée « gagné ».",
    filters: `Période : sur la date de signature. ${DEAL_FILTERS}`,
    minObservations: MIN_OBSERVATIONS,
  },
  stage_pair_delay: {
    id: "stage_pair_delay",
    label: "Délai entre deux étapes consécutives",
    unit: "days",
    family: "delays",
    definition:
      "Pour chaque paire d'étapes qui se suivent dans un pipeline, durée entre la première entrée d'une affaire dans la première et sa première entrée dans la seconde, sur les affaires qui ont atteint les deux — médiane et moyenne.",
    excludes:
      "Les affaires qui n'ont pas atteint la seconde étape ; les paires non consécutives ; les entrées reconstituées ; les paires qui partiraient d'une étape finale (gagné, perdu) : elle n'a pas de suivante.",
    whenInsufficient: INSUFFICIENT,
    howToFeed: "Une observation = une affaire entrée dans la première étape, puis dans la seconde.",
    filters: `Période : sur l'entrée dans la seconde étape. ${DEAL_FILTERS}`,
    minObservations: MIN_OBSERVATIONS,
  },
  share_response_delay: {
    id: "share_response_delay",
    label: "Délai partage → réponse du partenaire",
    unit: "days",
    family: "delays",
    definition:
      "Durée entre l'envoi d'un partage et la réponse du partenaire (acceptation ou refus). Un lien renvoyé ne compte pas comme un nouveau partage : la durée part du PREMIER envoi de la chaîne.",
    excludes:
      "Les partages sans réponse (en attente, révoqués sans réponse, expirés) ; les partages remplacés par un renvoi (seul le dernier de la chaîne porte la réponse).",
    whenInsufficient: INSUFFICIENT,
    howToFeed: "Une observation = un partage auquel le partenaire a répondu depuis son lien (accepté ou refusé).",
    filters: `Période : sur la date de réponse. ${DEAL_FILTERS}`,
    minObservations: MIN_OBSERVATIONS,
  },
  commission_settlement_delay: {
    id: "commission_settlement_delay",
    label: "Délai commission confirmée → réglée",
    unit: "days",
    family: "delays",
    definition:
      "Durée entre la confirmation d'une commission et la déclaration de son règlement, médiane et moyenne sur les commissions réglées dont les deux dates sont connues.",
    excludes:
      "Les commissions non réglées ; celles dont la date de confirmation est inconnue (confirmées avant que la date soit journalisée) — comptées à part, jamais remplacées par une date plausible.",
    whenInsufficient: INSUFFICIENT,
    howToFeed:
      "Une observation = une commission confirmée puis déclarée réglée dans l'outil (écran de suivi) — chaque geste pose sa date.",
    filters: `Période : sur la date de règlement. ${DEAL_FILTERS}`,
    minObservations: MIN_OBSERVATIONS,
  },
  lead_to_first_contact: {
    id: "lead_to_first_contact",
    label: "Délai lead → premier contact effectif",
    unit: "days",
    family: "delays",
    definition:
      "Pour chaque contact venu par un lead, durée entre l'arrivée de son PREMIER lead et la première interaction consignée avec lui à partir de là (appel, email ou rendez-vous — pas une note), médiane et moyenne.",
    excludes:
      "Les contacts sans interaction consignée depuis l'arrivée du lead (comptés à part : ils attendent encore un premier contact) ; les notes (une note n'est pas un contact) ; les interactions antérieures au lead (la relation existait déjà) ; les contacts arrivés autrement que par un lead ; les fiches supprimées (leurs interactions le sont aussi).",
    whenInsufficient: INSUFFICIENT,
    howToFeed:
      "Une observation = un lead reçu par l'API (Marque & réglages → Collecte) puis un appel, un email ou un rendez-vous consigné sur la fiche du contact.",
    filters:
      "Période : sur la première interaction. Conseiller : celui de la fiche contact. Origine : celle du premier lead. Type d'affaire et pipeline : sans effet — ce délai se mesure avant toute affaire.",
    minObservations: MIN_OBSERVATIONS,
  },

  // --- Le funnel : la chaîne continue, de la visite à la signature ---------
  funnel_visitors: {
    id: "funnel_visitors",
    label: "Visiteurs",
    unit: "count",
    family: "funnel",
    definition:
      "Navigateurs distincts (l'identifiant anonyme posé par l'extrait JavaScript, jamais une adresse IP) ayant chargé une page équipée dans la période. Un même navigateur qui revient compte une fois.",
    excludes:
      "Les pages sans extrait ; les navigateurs qui refusent tout stockage (pas d'identifiant, donc pas de visite) ; les envois refusés par l'API (domaine non déclaré, clé révoquée) — comptés dans Marque & réglages → Collecte, jamais ici.",
    whenInsufficient: `${COUNT_ALWAYS_SHOWN} Tant qu'aucune visite n'a jamais été reçue, le pas est « pas encore branché ».`,
    howToFeed: COLLECT_TO_FEED,
    filters: UPSTREAM_FILTERS,
    minObservations: MIN_OBSERVATIONS,
  },
  funnel_simulations_started: {
    id: "funnel_simulations_started",
    label: "Simulations démarrées",
    unit: "count",
    family: "funnel",
    definition:
      "Navigateurs distincts pour lesquels l'extrait a reçu « simulation démarrée » dans la période — un signal que le simulateur émet lui-même (clozado.track). Plusieurs simulations du même navigateur comptent une fois.",
    excludes: "Les simulateurs qui n'émettent pas le signal ; une simulation démarrée hors période.",
    whenInsufficient: COUNT_ALWAYS_SHOWN,
    howToFeed:
      "Appeler clozado.track(\"simulation_started\") au premier pas du simulateur (Marque & réglages → Collecte montre l'extrait et son mode d'emploi).",
    filters: UPSTREAM_FILTERS,
    minObservations: MIN_OBSERVATIONS,
  },
  funnel_simulations_completed: {
    id: "funnel_simulations_completed",
    label: "Simulations terminées",
    unit: "count",
    family: "funnel",
    definition:
      "Navigateurs distincts pour lesquels l'extrait a reçu « simulation terminée » dans la période. Plusieurs simulations terminées du même navigateur comptent une fois.",
    excludes:
      "Les simulateurs qui n'émettent pas le signal. Une simulation terminée déclarée seulement sur le lead (dates transmises par le serveur du simulateur) n'est pas un événement de visite : elle vit sur le lead, pas ici.",
    whenInsufficient: COUNT_ALWAYS_SHOWN,
    howToFeed: "Appeler clozado.track(\"simulation_completed\") au dernier pas du simulateur.",
    filters: UPSTREAM_FILTERS,
    minObservations: MIN_OBSERVATIONS,
  },
  funnel_leads: {
    id: "funnel_leads",
    label: "Leads reçus",
    unit: "count",
    family: "funnel",
    definition:
      "Leads enregistrés par l'entrée serveur (POST /api/leads) dans la période — une arrivée par lead, même quand plusieurs viennent de la même personne. C'est le pas où la chaîne passe du navigateur anonyme à une personne : les pas amont comptent des navigateurs, celui-ci et les suivants comptent des leads et des affaires.",
    excludes:
      "Les envois refusés par l'API (clé absente ou révoquée, charge invalide, débit dépassé) : ils ne sont pas enregistrés — Marque & réglages → Collecte les compte à part.",
    whenInsufficient: `${COUNT_ALWAYS_SHOWN} Tant qu'aucun lead n'a jamais été reçu, le pas est « pas encore branché ».`,
    howToFeed: "Faire appeler POST /api/leads par le simulateur ou le site, avec une clé d'API (Marque & réglages → Collecte).",
    filters:
      "Période : sur l'arrivée du lead. Origine : celle du lead. Conseiller : celui de la fiche contact du lead. Type et pipeline : sans effet ici — ils ne s'appliquent qu'à partir des affaires.",
    minObservations: MIN_OBSERVATIONS,
  },
  funnel_contacted: {
    id: "funnel_contacted",
    label: "Contacts établis",
    unit: "count",
    family: "funnel",
    definition:
      "Parmi les leads reçus dans la période, ceux dont la fiche porte au moins une interaction effective consignée à partir de l'arrivée du lead — appel, email ou rendez-vous, pas une note — à n'importe quelle date depuis. Même règle que le délai lead → premier contact effectif.",
    excludes:
      "Les notes ; les interactions antérieures au lead (la relation existait déjà) ; les fiches supprimées (leurs interactions le sont aussi). Une affaire créée sans interaction consignée ne compte PAS ici : ce pas mesure ce qui est consigné. S'il y a plus d'affaires que de contacts établis, les interactions ne sont pas toutes consignées — l'écran le dit.",
    whenInsufficient: COUNT_ALWAYS_SHOWN,
    howToFeed: "Consigner un appel, un email ou un rendez-vous sur la fiche du contact venu par le lead.",
    filters: "Les mêmes que « Leads reçus » : période sur l'arrivée du lead, origine du lead, conseiller de la fiche.",
    minObservations: MIN_OBSERVATIONS,
  },
  funnel_deals_from_leads: {
    id: "funnel_deals_from_leads",
    label: "Affaires issues de ces leads",
    unit: "count",
    family: "funnel",
    definition:
      "Les affaires dont l'origine est l'un des leads reçus dans la période — l'origine d'une affaire (deals.lead_id) est posée à sa création depuis le dernier lead antérieur du contact, ou rattachée à la main sur la fiche (journalisé). Une affaire compte une fois ; un lead peut en générer plusieurs.",
    excludes:
      "Les affaires sans lead (créées à la main, origine inconnue) : le funnel par pipeline les compte, pas la chaîne. Un lead arrivé APRÈS la création d'une affaire n'y est jamais rattaché tout seul.",
    whenInsufficient: COUNT_ALWAYS_SHOWN,
    howToFeed:
      "Créer l'affaire depuis la fiche d'un contact venu par un lead (l'origine se pose toute seule), ou rattacher le lead sur la fiche de l'affaire.",
    filters: `Période : sur l'ARRIVÉE DU LEAD, pas sur la création de l'affaire (la chaîne suit les leads de la période jusqu'à aujourd'hui). ${DEAL_FILTERS}`,
    minObservations: MIN_OBSERVATIONS,
  },
  funnel_won: {
    id: "funnel_won",
    label: "Affaires gagnées",
    unit: "count",
    family: "funnel",
    definition:
      "Parmi les affaires du pas précédent, celles qui sont AUJOURD'HUI dans une étape marquée « gagné » — l'état courant, celui du kanban. Dans la chaîne, le pas précédent est « affaires issues de ces leads » ; dans le funnel d'un pipeline, la dernière étape intermédiaire.",
    excludes:
      "Une affaire gagnée puis ressortie de l'étape (rouverte) n'est plus gagnée ; une organisation sans étape marquée « gagné » n'a pas de signature mesurable.",
    whenInsufficient: COUNT_ALWAYS_SHOWN,
    howToFeed: "Déplacer l'affaire dans l'étape marquée « gagné » (kanban ou fiche).",
    filters: `Les mêmes que le pas précédent. ${DEAL_FILTERS}`,
    minObservations: MIN_OBSERVATIONS,
  },
  funnel_stage_reached: {
    id: "funnel_stage_reached",
    label: "Affaires ayant atteint une étape",
    unit: "count",
    family: "funnel",
    definition:
      "Parmi les affaires CRÉÉES dans la période (une cohorte, suivie jusqu'à aujourd'hui), celles qui sont entrées dans l'étape ou dans une étape plus avancée du même pipeline, ou qui sont gagnées aujourd'hui : une affaire passée directement de la première à la troisième étape a atteint la deuxième — elle est allée au moins aussi loin. La première étape compte toutes les affaires créées.",
    excludes:
      "Rien : une entrée reconstituée après coup compte aussi — c'est le fait d'être entré qui compte ici, pas la date. Les étapes finales (gagné, perdu) ne sont pas des pas du funnel : gagné est l'arrivée, perdu est la déperdition.",
    whenInsufficient: COUNT_ALWAYS_SHOWN,
    howToFeed: "Créer des affaires et les faire avancer d'étape en étape (kanban ou fiche).",
    filters: `Période : sur la CRÉATION de l'affaire (cohorte). ${DEAL_FILTERS} Un funnel par pipeline.`,
    minObservations: MIN_OBSERVATIONS,
  },
  funnel_stage_leak: {
    id: "funnel_stage_leak",
    label: "Déperdition d'une étape : perdues et en cours",
    unit: "count",
    family: "funnel",
    definition:
      "Les affaires de la cohorte qui ont atteint l'étape sans atteindre la suivante — soit PERDUES (aujourd'hui dans une étape marquée « perdu », comptées à l'étape la plus avancée qu'elles ont atteinte), soit EN COURS (au plus loin dans cette étape, encore ouvertes aujourd'hui, même si elles sont redescendues depuis). Perdues + en cours = tout ce qui manque au pas suivant.",
    excludes: "Les affaires gagnées (elles ne manquent à aucun pas).",
    whenInsufficient: COUNT_ALWAYS_SHOWN,
    howToFeed: "Déplacer une affaire dans l'étape marquée « perdu » (avec son motif) la range ici, à l'étape qu'elle avait atteinte.",
    filters: "Les mêmes que « Affaires ayant atteint une étape ».",
    minObservations: MIN_OBSERVATIONS,
  },
  funnel_conversion_rate: {
    id: "funnel_conversion_rate",
    label: "Taux de passage et déperdition",
    unit: "ratio",
    family: "funnel",
    definition:
      "Entre deux pas consécutifs : le nombre du pas divisé par celui du pas précédent, en pour-cent ; la déperdition est le complément à 100 %. Un pas sans objet (filtre qui ne s'y applique pas, source non branchée) est sauté : le taux se calcule depuis le dernier pas mesurable.",
    excludes:
      "Rien n'est écarté, mais un taux peut dépasser 100 % quand un pas compte plus que le précédent — plus de leads que de simulations terminées mesurées (des leads arrivent sans passer par l'extrait), plus d'affaires que de contacts établis (des interactions ne sont pas consignées). Ce n'est pas une erreur de calcul, c'est une mesure incomplète en amont : l'écran l'affiche tel quel et le dit, la déperdition est alors sans objet.",
    whenInsufficient: `Masqué tant que le pas précédent compte moins de ${MIN_OBSERVATIONS} observations ; l'écran indique combien il en manque. Les nombres, eux, restent affichés.`,
    howToFeed: "Alimenter les deux pas : le taux apparaît dès que le pas précédent atteint le seuil.",
    filters: "Ceux des deux pas concernés.",
    minObservations: MIN_OBSERVATIONS,
  },
  funnel_by_origin: {
    id: "funnel_by_origin",
    label: "Conversion par origine",
    unit: "count",
    family: "funnel",
    definition:
      "La chaîne complète, groupée par origine : visiteurs, simulations, leads reçus, contacts établis, affaires issues de ces leads et affaires gagnées — les MÊMES définitions que la chaîne, appliquées à l'origine de l'événement ou du lead. Deux taux : lead → affaire et affaire → gagnée. C'est la réponse à « quelle origine génère des affaires qui se signent ».",
    excludes:
      "Les affaires sans lead figurent sur la ligne « sans origine » (affaires et gagnées seulement — rien en amont ne leur correspond). Les textes reçus non rattachés à une origine configurée sont regroupés sur « à rapprocher » (Analytique → Origines).",
    whenInsufficient: `Les nombres s'affichent toujours ; chaque taux est masqué sous ${MIN_OBSERVATIONS} observations à son dénominateur.`,
    howToFeed: "Configurer les origines et rapprocher les textes reçus (Analytique → Origines) ; transmettre l'origine dans l'extrait et dans /api/leads.",
    filters: "Ceux de la chaîne, pas à pas ; avec un filtre origine, une seule ligne reste.",
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
