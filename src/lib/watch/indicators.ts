import type { Periodicity } from "./periods";

/**
 * LE CATALOGUE DES INDICATEURS DE MARCHÉ — des données, comme les packs
 * métier : une clé, un libellé, la source officielle, l'unité, la
 * périodicité et la SPÉCIFICATION D'APPEL à l'API publique qui le publie
 * (BCE, Eurostat, INSEE, Banque de France Webstat — toutes sans clé,
 * sondées le 2026-08-26). Ajouter un indicateur, c'est ajouter une entrée
 * ici ; aucune migration, aucun chiffre en dur : ce fichier ne contient
 * AUCUNE valeur, seulement où et comment la lire. Les valeurs vivent dans
 * `market_observations`, telles que publiées, datées, sourcées.
 *
 * Séries identifiées par appel réel (docs/module-ciblage-contenu.md,
 * « Étape 4 ») — pas de mémoire : l'IPC base 2015 et le jeu Eurostat
 * `prc_hicp_manr` sont arrêtés depuis 2025, leurs remplaçants sont ici.
 */
export type IndicatorSpec =
  | { provider: "ecb"; flow: string; key: string }
  | { provider: "eurostat"; dataset: string; params: Record<string, string> }
  | { provider: "insee"; idbank: string }
  | { provider: "webstat"; dataset: string };

export type IndicatorUnit = "%" | "index";

export type MarketIndicator = {
  key: string;
  label: string;
  /** Ce que mesure l'indicateur, pour l'écran (jamais dans le prompt). */
  description: string;
  sourceName: string;
  /** La page officielle vers laquelle renvoie la mention de source. */
  sourceUrl: string;
  unit: IndicatorUnit;
  periodicity: Periodicity;
  spec: IndicatorSpec;
};

export const MARKET_INDICATORS: readonly MarketIndicator[] = [
  {
    key: "bce_facilite_depot",
    label: "Taux de la facilité de dépôt (BCE)",
    description: "Le taux directeur de référence de la zone euro : ce que la BCE verse aux banques sur leurs dépôts. La date est celle de la dernière décision.",
    sourceName: "Banque centrale européenne",
    sourceUrl: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/key_ecb_interest_rates/html/index.fr.html",
    unit: "%",
    periodicity: "on_change",
    spec: { provider: "ecb", flow: "FM", key: "B.U2.EUR.4F.KR.DFR.LEV" },
  },
  {
    key: "bce_refinancement",
    label: "Taux des opérations principales de refinancement (BCE)",
    description: "Le taux auquel les banques se refinancent à une semaine auprès de la BCE. La date est celle de la dernière décision.",
    sourceName: "Banque centrale européenne",
    sourceUrl: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/key_ecb_interest_rates/html/index.fr.html",
    unit: "%",
    periodicity: "on_change",
    spec: { provider: "ecb", flow: "FM", key: "B.U2.EUR.4F.KR.MRR_FR.LEV" },
  },
  {
    key: "estr",
    label: "€STR (taux à court terme de l'euro)",
    description: "Le taux au jour le jour du marché interbancaire en euros, publié chaque matin par la BCE.",
    sourceName: "Banque centrale européenne",
    sourceUrl: "https://www.ecb.europa.eu/stats/financial_markets_and_interest_rates/euro_short-term_rate/html/index.en.html",
    unit: "%",
    periodicity: "daily",
    spec: { provider: "ecb", flow: "EST", key: "B.EU000A2X2A25.WT" },
  },
  {
    key: "fr_tec10",
    label: "OAT 10 ans (TEC 10)",
    description: "Le taux de l'échéance constante à 10 ans des emprunts d'État français — la référence des taux longs, publiée chaque jour ouvré.",
    sourceName: "Banque de France (Webstat)",
    sourceUrl: "https://webstat.banque-france.fr/fr/catalogue/FM/FM.D.FR.EUR.FR2.BB.FRMOYTEC10.HSTA",
    unit: "%",
    periodicity: "daily",
    spec: { provider: "webstat", dataset: "fm-d-fr-eur-fr2-bb-frmoytec10-hsta" },
  },
  {
    key: "fr_taux_long_terme",
    label: "Taux long terme France (10 ans, moyenne mensuelle)",
    description: "Le rendement moyen mensuel des obligations d'État françaises à 10 ans, tel que la BCE le publie pour la convergence.",
    sourceName: "Banque centrale européenne",
    sourceUrl: "https://data.ecb.europa.eu/data/datasets/IRS/IRS.M.FR.L.L40.CI.0000.EUR.N.Z",
    unit: "%",
    periodicity: "monthly",
    spec: { provider: "ecb", flow: "IRS", key: "M.FR.L.L40.CI.0000.EUR.N.Z" },
  },
  {
    key: "fr_usure_immo_20ans",
    label: "Taux d'usure — prêts immobiliers à taux fixe de 20 ans et plus",
    description: "Le taux annuel effectif global maximal auquel un prêt immobilier de 20 ans et plus peut être accordé ce trimestre.",
    sourceName: "Banque de France (Webstat)",
    sourceUrl: "https://webstat.banque-france.fr/fr/catalogue/MIR1/MIR1.Q.FR.R.A22FRF.W3.U.A.2254FR.EUR.N",
    unit: "%",
    periodicity: "quarterly",
    spec: { provider: "webstat", dataset: "mir1-q-fr-r-a22frf-w3-u-a-2254fr-eur-n" },
  },
  {
    key: "fr_usure_immo_10_20ans",
    label: "Taux d'usure — prêts immobiliers à taux fixe de 10 à moins de 20 ans",
    description: "Le taux annuel effectif global maximal auquel un prêt immobilier de 10 à moins de 20 ans peut être accordé ce trimestre.",
    sourceName: "Banque de France (Webstat)",
    sourceUrl: "https://webstat.banque-france.fr/fr/catalogue/MIR1/MIR1.Q.FR.R.A22FRF.W2.U.A.2254FR.EUR.N",
    unit: "%",
    periodicity: "quarterly",
    spec: { provider: "webstat", dataset: "mir1-q-fr-r-a22frf-w2-u-a-2254fr-eur-n" },
  },
  {
    key: "fr_tem_immo_20ans",
    label: "Taux effectif moyen — prêts immobiliers à taux fixe de 20 ans et plus",
    description: "Le taux annuel effectif global moyen des prêts immobiliers de 20 ans et plus accordés aux particuliers au cours du trimestre précédent.",
    sourceName: "Banque de France (Webstat)",
    sourceUrl: "https://webstat.banque-france.fr/fr/catalogue/MIR1/MIR1.Q.FR.R.A22FRF.W3.R.A.2254FR.EUR.N",
    unit: "%",
    periodicity: "quarterly",
    spec: { provider: "webstat", dataset: "mir1-q-fr-r-a22frf-w3-r-a-2254fr-eur-n" },
  },
  {
    key: "fr_inflation_ipc",
    label: "Inflation en France (IPC, sur un an)",
    description: "La hausse des prix à la consommation sur douze mois, ensemble des ménages, France — l'indice de référence de l'INSEE (base 2025).",
    sourceName: "INSEE",
    sourceUrl: "https://www.insee.fr/fr/statistiques/serie/011814632",
    unit: "%",
    periodicity: "monthly",
    spec: { provider: "insee", idbank: "011814632" },
  },
  {
    key: "ze_inflation_ipch",
    label: "Inflation dans la zone euro (IPCH, sur un an)",
    description: "La hausse des prix à la consommation harmonisée sur douze mois dans la zone euro, celle que suit la BCE.",
    sourceName: "Eurostat",
    sourceUrl: "https://ec.europa.eu/eurostat/databrowser/view/ei_cphi_m/default/table",
    unit: "%",
    periodicity: "monthly",
    spec: { provider: "eurostat", dataset: "ei_cphi_m", params: { geo: "EA20", indic: "TOTAL", unit: "RT12" } },
  },
  {
    key: "fr_irl",
    label: "Indice de référence des loyers (IRL)",
    description: "L'indice trimestriel qui plafonne la révision annuelle des loyers d'habitation.",
    sourceName: "INSEE",
    sourceUrl: "https://www.insee.fr/fr/statistiques/serie/001515333",
    unit: "index",
    periodicity: "quarterly",
    spec: { provider: "insee", idbank: "001515333" },
  },
  {
    key: "fr_irl_variation",
    label: "Variation annuelle de l'IRL",
    description: "La hausse maximale d'un loyer d'habitation révisé ce trimestre, en pourcentage sur un an.",
    sourceName: "INSEE",
    sourceUrl: "https://www.insee.fr/fr/statistiques/serie/001515334",
    unit: "%",
    periodicity: "quarterly",
    spec: { provider: "insee", idbank: "001515334" },
  },
  {
    key: "fr_prix_logements_anciens",
    label: "Prix des logements anciens (indice Notaires-INSEE, France métropolitaine)",
    description: "L'indice trimestriel des prix des logements anciens, ensemble, corrigé des variations saisonnières, base 100 en 2015.",
    sourceName: "INSEE (Notaires-INSEE)",
    sourceUrl: "https://www.insee.fr/fr/statistiques/serie/010567059",
    unit: "index",
    periodicity: "quarterly",
    spec: { provider: "insee", idbank: "010567059" },
  },
];

const BY_KEY = new Map(MARKET_INDICATORS.map((i) => [i.key, i]));

export function getIndicator(key: string): MarketIndicator | null {
  return BY_KEY.get(key) ?? null;
}

/** Espace fine insécable — « 2,25 % » ne se coupe jamais. */
const NNBSP = " ";

/**
 * La valeur telle qu'elle se CITE (`verified_figures.value`) : nombre en
 * français avec la précision publiée (« 2,25 % », « 2,189 % », « 127,4 »).
 * C'est la chaîne que le prompt transmet et que la revue reconnaît.
 */
export function formatIndicatorValue(valueText: string, unit: IndicatorUnit): string {
  const n = Number(valueText.replace(",", "."));
  if (Number.isNaN(n)) return unit === "%" ? `${valueText}${NNBSP}%` : valueText;
  const decimals = Math.min((valueText.split(/[.,]/)[1] ?? "").replace(/0+$/, "").length, 4);
  const formatted = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: Math.min(decimals, 2), maximumFractionDigits: decimals }).format(n);
  return unit === "%" ? `${formatted}${NNBSP}%` : formatted;
}
