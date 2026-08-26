import type { Messages } from "@/i18n/messages";

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
  /** Le slug du sujet : son libellé et ses termes de recherche (séparés par « | ») sont `templates.topics.<slug>.*` dans les messages — du contenu dans la langue de l'organisation. */
  slug: keyof Messages["templates"]["topics"];
  /** « fr », « en » — sources françaises ET anglophones au choix du métier. */
  languages: string[];
};

export type WatchSourceTemplate = {
  /** Le slug de la source : son libellé est `templates.sources.<slug>` dans les messages. */
  slug: keyof Messages["templates"]["sources"];
  siteUrl: string;
  /** Vérifié par appel réel ; null = pas de flux, la source vit par la recherche restreinte à son domaine (et a besoin d'un sujet). */
  feedUrl: string | null;
  /** ISO 3166-1 alpha-2 ; « EU » pour une institution européenne. */
  country: string;
  lang: string;
  /** Le slug d'un sujet du même pack, ou null pour une source générale (les articles sont classés par thème au résumé). */
  topic: keyof Messages["templates"]["topics"] | null;
};

export type WatchDefaults = {
  topics: readonly WatchTopicTemplate[];
  sources: readonly WatchSourceTemplate[];
  indicators: readonly string[];
};

const BERCY: WatchSourceTemplate = {
  slug: "ministere_de_l_economie_ac97",
  siteUrl: "https://www.economie.gouv.fr",
  feedUrl: "https://www.economie.gouv.fr/rss/toutesactualites",
  country: "FR",
  lang: "fr",
  topic: null,
};

const AMF_EPARGNANTS: WatchSourceTemplate = {
  slug: "amf_epargnants",
  siteUrl: "https://www.amf-france.org",
  feedUrl: "https://www.amf-france.org/fr/flux-rss/display/22",
  country: "FR",
  lang: "fr",
  topic: null,
};

const AMF_COMMUNIQUES: WatchSourceTemplate = {
  slug: "amf_communiques_de_presse",
  siteUrl: "https://www.amf-france.org/fr/actualites-publications/communiques",
  feedUrl: "https://www.amf-france.org/fr/flux-rss/display/23",
  country: "FR",
  lang: "fr",
  topic: null,
};

const BCE_PRESSE: WatchSourceTemplate = {
  slug: "banque_centrale_europeenne_communiques",
  siteUrl: "https://www.ecb.europa.eu",
  feedUrl: "https://www.ecb.europa.eu/rss/press.html",
  country: "EU",
  lang: "en",
  topic: null,
};

const BOE_NEWS: WatchSourceTemplate = {
  slug: "bank_of_england_news",
  siteUrl: "https://www.bankofengland.co.uk",
  feedUrl: "https://www.bankofengland.co.uk/rss/news",
  country: "GB",
  lang: "en",
  topic: null,
};

const ANIL: WatchSourceTemplate = {
  slug: "anil_information_sur_le_54f6",
  siteUrl: "https://www.anil.org",
  feedUrl: null,
  country: "FR",
  lang: "fr",
  topic: "credit_immobilier",
};

export const COURTIER_CREDIT_WATCH: WatchDefaults = {
  topics: [
    { slug: "credit_immobilier", languages: ["fr"] },
    { slug: "taux_d_usure_et_d2e9", languages: ["fr"] },
    { slug: "marche_immobilier", languages: ["fr"] },
    { slug: "assurance_emprunteur", languages: ["fr"] },
    { slug: "aides_a_l_achat_0e62", languages: ["fr"] },
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
    { slug: "assurance_vie_et_placements", languages: ["fr"] },
    { slug: "scpi_et_immobilier_locatif", languages: ["fr"] },
    { slug: "fiscalite_du_patrimoine", languages: ["fr"] },
    { slug: "retraite", languages: ["fr"] },
    { slug: "marches_financiers", languages: ["fr", "en"] },
  ],
  sources: [AMF_EPARGNANTS, AMF_COMMUNIQUES, BERCY, BCE_PRESSE, BOE_NEWS],
  indicators: ["bce_facilite_depot", "estr", "fr_tec10", "fr_inflation_ipc", "ze_inflation_ipch", "fr_prix_logements_anciens", "fr_irl_variation"],
};

export const ASSURANCE_WATCH: WatchDefaults = {
  topics: [
    { slug: "assurance_emprunteur", languages: ["fr"] },
    { slug: "prevoyance_et_sante", languages: ["fr"] },
    { slug: "assurance_habitation_et_automobile", languages: ["fr"] },
    { slug: "reglementation_de_l_assurance", languages: ["fr"] },
    { slug: "epargne_et_assurance_vie", languages: ["fr"] },
  ],
  sources: [BERCY, AMF_EPARGNANTS],
  indicators: ["bce_facilite_depot", "fr_inflation_ipc", "fr_usure_immo_20ans", "fr_irl_variation"],
};

export const GENERIQUE_WATCH: WatchDefaults = {
  topics: [
    { slug: "actualite_economique", languages: ["fr", "en"] },
    { slug: "immobilier", languages: ["fr"] },
    { slug: "fiscalite", languages: ["fr"] },
    { slug: "epargne_et_placements", languages: ["fr"] },
  ],
  sources: [BERCY, BCE_PRESSE],
  indicators: ["bce_facilite_depot", "fr_tec10", "fr_inflation_ipc", "ze_inflation_ipch"],
};
