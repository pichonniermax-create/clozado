/**
 * LA VEILLE PAR DÉFAUT D'UN MÉTIER — des données, rattachées à chaque pack
 * (src/lib/metrics/packs.ts) comme les cibles : des SUJETS (avec leurs
 * termes de recherche et leurs langues), des SOURCES publiques dont le flux
 * a été vérifié par appel réel le 2026-08-26, et les INDICATEURS de marché
 * à suivre (clés du catalogue, src/lib/watch/indicators.ts). Instanciés en
 * lignes de l'organisation à sa demande, puis modifiables ; aucun écran ne
 * lit ces gabarits pour s'afficher. Rien ici n'est propre à un client :
 * un courtier suit le crédit et le marché immobilier, un CGP l'épargne et
 * la fiscalité — c'est le métier qui parle, l'organisation ajuste.
 */
export type WatchTopicTemplate = {
  label: string;
  searchTerms: string[];
  /** « fr », « en » — sources françaises ET anglophones au choix du métier. */
  languages: string[];
};

export type WatchSourceTemplate = {
  label: string;
  siteUrl: string;
  /** Vérifié par appel réel ; null = pas de flux, la source vit par la recherche restreinte à son domaine (et a besoin d'un sujet). */
  feedUrl: string | null;
  /** ISO 3166-1 alpha-2 ; « EU » pour une institution européenne. */
  country: string;
  lang: string;
  /** Le libellé d'un sujet du même pack, ou null pour une source générale (les articles sont classés par thème au résumé). */
  topic: string | null;
};

export type WatchDefaults = {
  topics: readonly WatchTopicTemplate[];
  sources: readonly WatchSourceTemplate[];
  indicators: readonly string[];
};

const BERCY: WatchSourceTemplate = {
  label: "Ministère de l'Économie — actualités",
  siteUrl: "https://www.economie.gouv.fr",
  feedUrl: "https://www.economie.gouv.fr/rss/toutesactualites",
  country: "FR",
  lang: "fr",
  topic: null,
};

const AMF_EPARGNANTS: WatchSourceTemplate = {
  label: "AMF — épargnants",
  siteUrl: "https://www.amf-france.org",
  feedUrl: "https://www.amf-france.org/fr/flux-rss/display/22",
  country: "FR",
  lang: "fr",
  topic: null,
};

const AMF_COMMUNIQUES: WatchSourceTemplate = {
  label: "AMF — communiqués de presse",
  siteUrl: "https://www.amf-france.org/fr/actualites-publications/communiques",
  feedUrl: "https://www.amf-france.org/fr/flux-rss/display/23",
  country: "FR",
  lang: "fr",
  topic: null,
};

const BCE_PRESSE: WatchSourceTemplate = {
  label: "Banque centrale européenne — communiqués",
  siteUrl: "https://www.ecb.europa.eu",
  feedUrl: "https://www.ecb.europa.eu/rss/press.html",
  country: "EU",
  lang: "en",
  topic: null,
};

const BOE_NEWS: WatchSourceTemplate = {
  label: "Bank of England — news",
  siteUrl: "https://www.bankofengland.co.uk",
  feedUrl: "https://www.bankofengland.co.uk/rss/news",
  country: "GB",
  lang: "en",
  topic: null,
};

const ANIL: WatchSourceTemplate = {
  label: "ANIL — information sur le logement",
  siteUrl: "https://www.anil.org",
  feedUrl: null,
  country: "FR",
  lang: "fr",
  topic: "Crédit immobilier",
};

export const COURTIER_CREDIT_WATCH: WatchDefaults = {
  topics: [
    { label: "Crédit immobilier", searchTerms: ["taux crédit immobilier", "prêt immobilier banques"], languages: ["fr"] },
    { label: "Taux d'usure et conditions d'emprunt", searchTerms: ["taux d'usure", "conditions d'octroi crédit immobilier HCSF"], languages: ["fr"] },
    { label: "Marché immobilier", searchTerms: ["prix immobilier ancien", "marché immobilier"], languages: ["fr"] },
    { label: "Assurance emprunteur", searchTerms: ["assurance emprunteur"], languages: ["fr"] },
    { label: "Aides à l'achat et primo-accédants", searchTerms: ["prêt à taux zéro", "aides accession propriété"], languages: ["fr"] },
  ],
  sources: [BERCY, ANIL, BCE_PRESSE],
  indicators: [
    "bce_facilite_depot",
    "fr_tec10",
    "fr_usure_immo_20ans",
    "fr_usure_immo_10_20ans",
    "fr_tem_immo_20ans",
    "fr_inflation_ipc",
    "fr_prix_logements_anciens",
    "fr_irl",
  ],
};

export const CGP_WATCH: WatchDefaults = {
  topics: [
    { label: "Assurance-vie et placements", searchTerms: ["assurance-vie rendement fonds euros", "placements épargne"], languages: ["fr"] },
    { label: "SCPI et immobilier locatif", searchTerms: ["SCPI", "investissement locatif fiscalité"], languages: ["fr"] },
    { label: "Fiscalité du patrimoine", searchTerms: ["fiscalité patrimoine", "succession donation impôt"], languages: ["fr"] },
    { label: "Retraite", searchTerms: ["retraite réforme", "plan épargne retraite PER"], languages: ["fr"] },
    { label: "Marchés financiers", searchTerms: ["marchés financiers", "central banks interest rates markets"], languages: ["fr", "en"] },
  ],
  sources: [AMF_EPARGNANTS, AMF_COMMUNIQUES, BERCY, BCE_PRESSE, BOE_NEWS],
  indicators: ["bce_facilite_depot", "estr", "fr_tec10", "fr_inflation_ipc", "ze_inflation_ipch", "fr_prix_logements_anciens", "fr_irl_variation"],
};

export const ASSURANCE_WATCH: WatchDefaults = {
  topics: [
    { label: "Assurance emprunteur", searchTerms: ["assurance emprunteur loi Lemoine"], languages: ["fr"] },
    { label: "Prévoyance et santé", searchTerms: ["prévoyance", "complémentaire santé"], languages: ["fr"] },
    { label: "Assurance habitation et automobile", searchTerms: ["assurance habitation", "assurance auto tarifs"], languages: ["fr"] },
    { label: "Réglementation de l'assurance", searchTerms: ["ACPR assurance", "réglementation assurance"], languages: ["fr"] },
    { label: "Épargne et assurance-vie", searchTerms: ["assurance-vie"], languages: ["fr"] },
  ],
  sources: [BERCY, AMF_EPARGNANTS],
  indicators: ["bce_facilite_depot", "fr_inflation_ipc", "fr_usure_immo_20ans", "fr_irl_variation"],
};

export const GENERIQUE_WATCH: WatchDefaults = {
  topics: [
    { label: "Actualité économique", searchTerms: ["actualité économique France", "euro area economic outlook"], languages: ["fr", "en"] },
    { label: "Immobilier", searchTerms: ["marché immobilier"], languages: ["fr"] },
    { label: "Fiscalité", searchTerms: ["fiscalité particuliers entreprises"], languages: ["fr"] },
    { label: "Épargne et placements", searchTerms: ["épargne placements"], languages: ["fr"] },
  ],
  sources: [BERCY, BCE_PRESSE],
  indicators: ["bce_facilite_depot", "fr_tec10", "fr_inflation_ipc", "ze_inflation_ipch"],
};
