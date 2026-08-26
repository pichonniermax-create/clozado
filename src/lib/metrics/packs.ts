import type { MetricId } from "./definitions";
import type { PeriodPresetKey } from "./search-params";
import {
  ASSURANCE_TARGETS,
  CGP_TARGETS,
  COURTIER_CREDIT_TARGETS,
  GENERIQUE_TARGETS,
  type TargetTemplate,
} from "@/lib/targets/templates";

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
 * CIBLES PAR DÉFAUT de son métier (src/lib/targets/templates.ts) :
 * instanciées en lignes de l'organisation à sa demande, puis modifiables —
 * jamais lues depuis le code par les écrans.
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
  key: string;
  label: string;
  /** À qui il s'adresse, en une ligne. */
  audience: string;
  /** Ce qu'il met en avant, et pourquoi. */
  description: string;
  /** Les indicateurs du tableau de bord, dans l'ordre d'affichage. */
  indicators: readonly DashboardIndicatorId[];
  /** Les cibles de newsletter proposées à ce métier, dans l'ordre de création. */
  targets: readonly TargetTemplate[];
};

export const BUSINESS_PACKS = {
  courtier_credit: {
    key: "courtier_credit",
    label: "Courtier en crédit",
    audience: "Courtage en prêt immobilier, rachat de crédit, crédit professionnel.",
    description:
      "Les volumes et les délais : ce qui entre, ce qui se signe et pour combien, combien de temps prend une signature, la réactivité sur les leads, ce qui se perd, les apporteurs et les commissions acquises.",
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
  },
  cgp: {
    key: "cgp",
    label: "Conseil en gestion de patrimoine",
    audience: "CGP, conseil en investissement, courtage en placements.",
    description:
      "Les encours et la collecte : ce qui est signé et pour combien, ce qui est en cours dans le pipeline, les commissions acquises, la transformation des dossiers partagés, les délais et les pertes.",
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
  },
  assurance: {
    key: "assurance",
    label: "Courtier en assurance",
    audience: "Assurance emprunteur, prévoyance, santé, IARD.",
    description:
      "La transformation et la réactivité : les leads reçus et le délai de premier contact, les dossiers créés et signés, ce qui se perd et pourquoi, l'acceptation des partages, les commissions acquises.",
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
  },
  generique: {
    key: "generique",
    label: "Tout métier",
    audience: "Une PME, un cabinet qui ne se reconnaît dans aucun pack.",
    description: "Un équilibre : ce qui entre et se signe, l'encours du pipeline, le délai de signature, les pertes, les partages et les commissions acquises.",
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
