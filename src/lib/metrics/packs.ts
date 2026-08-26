import type { MetricId } from "./definitions";
import type { PeriodPresetKey } from "./search-params";
import {
  ASSURANCE_TARGETS,
  CGP_TARGETS,
  COURTIER_CREDIT_TARGETS,
  GENERIQUE_TARGETS,
  type TargetTemplate,
} from "@/lib/targets/templates";
import { ASSURANCE_WATCH, CGP_WATCH, COURTIER_CREDIT_WATCH, GENERIQUE_WATCH, type WatchDefaults } from "@/lib/watch/templates";
import type { Messages } from "@/i18n/messages";

/**
 * LES PACKS MÉTIER — des données, pas des conditions dans le code : un pack
 * est une liste ordonnée d'indicateurs du registre, mis en avant sur le
 * tableau de bord de l'organisation qui l'a choisi (Marque & réglages).
 * Le tableau de bord parcourt cette liste ; il ne sait pas quel pack il
 * affiche. Ajouter un pack ou changer ses indicateurs, c'est éditer ce
 * fichier — versionné avec les définitions qu'il référence, ce qu'une
 * table ne garantirait pas (un pack ne peut pas nommer une métrique qui
 * n'existe pas). Un CGP suit ses encours et sa collecte ; un courtier
 * suit ses volumes et ses délais.
 *
 * Depuis le chantier « ciblage et contenu », un pack porte aussi les
 * CIBLES PAR DÉFAUT de son métier (src/lib/targets/templates.ts) et sa
 * VEILLE PAR DÉFAUT — sujets, sources publiques, indicateurs de marché
 * (src/lib/watch/templates.ts) : instanciés en lignes de l'organisation à
 * sa demande, puis modifiables — jamais lus depuis le code par les écrans.
 */

/** Les indicateurs qu'un tableau de bord sait afficher en tuile — un scalaire par indicateur, calculé par `dashboardIndicators`. */
export const DASHBOARD_INDICATOR_IDS = [
  "deals_created",
  "deals_won",
  "won_amount",
  "pipeline_open",
  "creation_to_won",
  "lead_to_first_contact",
  "share_response_delay",
  "commission_settlement_delay",
  "loss_rate",
  "lost_deal",
  "funnel_leads",
  "partner_shares",
  "partner_acceptance_rate",
  "partner_transformation_rate",
  "partner_commissions",
] as const satisfies readonly MetricId[];

export type DashboardIndicatorId = (typeof DASHBOARD_INDICATOR_IDS)[number];

export type BusinessPack = {
  /** La clé du pack : ses textes (libellé, à qui il s'adresse, ce qu'il met en avant) sont `metrics.packs.<key>.*` dans les messages. */
  key: keyof Messages["metrics"]["packs"];
  /** Les indicateurs du tableau de bord, dans l'ordre d'affichage. */
  indicators: readonly DashboardIndicatorId[];
  /** Les cibles de newsletter proposées à ce métier, dans l'ordre de création. */
  targets: readonly TargetTemplate[];
  /** Les sujets, sources et indicateurs de marché proposés à ce métier. */
  watch: WatchDefaults;
};

export const BUSINESS_PACKS = {
  courtier_credit: {
    key: "courtier_credit",
    indicators: [
      "deals_created",
      "deals_won",
      "won_amount",
      "creation_to_won",
      "lead_to_first_contact",
      "loss_rate",
      "partner_shares",
      "partner_commissions",
    ],
    targets: COURTIER_CREDIT_TARGETS,
    watch: COURTIER_CREDIT_WATCH,
  },
  cgp: {
    key: "cgp",
    indicators: [
      "won_amount",
      "deals_won",
      "pipeline_open",
      "partner_commissions",
      "partner_transformation_rate",
      "creation_to_won",
      "loss_rate",
      "lead_to_first_contact",
    ],
    targets: CGP_TARGETS,
    watch: CGP_WATCH,
  },
  assurance: {
    key: "assurance",
    indicators: [
      "funnel_leads",
      "lead_to_first_contact",
      "deals_created",
      "deals_won",
      "loss_rate",
      "lost_deal",
      "partner_acceptance_rate",
      "partner_commissions",
    ],
    targets: ASSURANCE_TARGETS,
    watch: ASSURANCE_WATCH,
  },
  generique: {
    key: "generique",
    indicators: [
      "deals_created",
      "deals_won",
      "won_amount",
      "pipeline_open",
      "creation_to_won",
      "loss_rate",
      "partner_shares",
      "partner_commissions",
    ],
    targets: GENERIQUE_TARGETS,
    watch: GENERIQUE_WATCH,
  },
} as const satisfies Record<string, BusinessPack>;

export type BusinessPackKey = keyof typeof BUSINESS_PACKS;

/** Dans l'ordre de présentation du réglage. */
export const BUSINESS_PACK_LIST: BusinessPack[] = Object.values(BUSINESS_PACKS);

/** Le pack montré tant que l'organisation n'en a pas choisi — le tableau de bord le dit. */
export const DEFAULT_PACK: BusinessPackKey = "generique";

export function parseBusinessPack(value: string | null | undefined): BusinessPackKey | null {
  return value && value in BUSINESS_PACKS ? (value as BusinessPackKey) : null;
}

/** Le pack d'une organisation d'après sa colonne : le sien, ou le pack par défaut avec `chosen: false` (jamais choisi, ou clé inconnue). */
export function resolveBusinessPack(value: string | null | undefined): { pack: BusinessPack; chosen: boolean } {
  const key = parseBusinessPack(value);
  return key ? { pack: BUSINESS_PACKS[key], chosen: true } : { pack: BUSINESS_PACKS[DEFAULT_PACK], chosen: false };
}

/** La période du tableau de bord sans paramètre : assez large pour que les délais passent le seuil, assez courte pour que les volumes parlent. */
export const DASHBOARD_PERIOD: PeriodPresetKey = "90j";
