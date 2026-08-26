import type { Messages } from "@/i18n/messages";
import type { SegmentCriteria } from "./criteria";

/**
 * LES CIBLES PAR DÉFAUT D'UN MÉTIER — des données, rattachées à chaque pack
 * métier (src/lib/metrics/packs.ts), instanciées en LIGNES de
 * `mail_targets` de l'organisation à sa demande (« créer les cibles de mon
 * métier »), puis modifiables, dupliquées, désactivées comme n'importe
 * quelle cible. Aucun écran ne lit ces gabarits pour s'afficher : une fois
 * créées, les cibles vivent en base ; ici ne vit que le point de départ.
 *
 * Les étiquettes y sont nommées par LIBELLÉ (« Investisseur », dans les
 * messages) : elles n'existent pas encore dans une organisation neuve,
 * l'instanciation les crée si besoin et remplace le libellé par
 * l'identifiant. Rien ici n'est
 * propre à un client : un courtier en crédit écrit à des primo-accédants
 * et à des investisseurs, un CGP à des clients qui préparent leur
 * retraite — c'est le métier qui parle, l'organisation ajuste ensuite.
 */
export type TargetTemplate = {
  /**
   * Le slug du gabarit : ses textes — libellé, description, les six facettes
   * de l'identité éditoriale, et les étiquettes à porter ou non (`tagsAny`,
   * `tagsNone`, séparées par « | ») — sont `templates.targets.<slug>.*` dans
   * les messages, fournis dans la langue par défaut de l'organisation au
   * moment de l'instanciation (docs/module-marque-blanche-i18n.md §2.3).
   */
  slug: keyof Messages["templates"]["targets"];
  criteria: Omit<SegmentCriteria, "tagsAny" | "tagsNone" | "ownerIds" | "dealStageIds" | "dealPipelineIds" | "originIds">;
};

const SANS_NOUVELLES: TargetTemplate = {
  slug: "sans-nouvelles",
  // Les deux bornes ensemble : une fiche créée hier sans interaction n'est
  // pas « sans nouvelles depuis six mois » — vu au navigateur.
  criteria: { inactiveForDays: 180, createdMoreThanDays: 180 },
};

export const COURTIER_CREDIT_TARGETS: readonly TargetTemplate[] = [
  {
    slug: "primo-accedants",
    criteria: { kind: "person" },
  },
  {
    slug: "investisseurs",
    criteria: {},
  },
  {
    slug: "clients-finances",
    criteria: { deals: "won" },
  },
  {
    slug: "projets-en-cours",
    criteria: { deals: "open" },
  },
  SANS_NOUVELLES,
];

export const CGP_TARGETS: readonly TargetTemplate[] = [
  {
    slug: "clients",
    criteria: { deals: "won" },
  },
  {
    slug: "prospects-en-reflexion",
    criteria: { deals: "open" },
  },
  {
    slug: "chefs-d-entreprise",
    criteria: {},
  },
  {
    slug: "preparation-retraite",
    criteria: { kind: "person", ageMin: 50 },
  },
  {
    slug: "jeunes-actifs",
    criteria: { kind: "person", ageMax: 39 },
  },
];

export const ASSURANCE_TARGETS: readonly TargetTemplate[] = [
  {
    slug: "assures-emprunteurs",
    criteria: {},
  },
  {
    slug: "professionnels-tns",
    criteria: {},
  },
  {
    slug: "clients-assures",
    criteria: { deals: "won" },
  },
  {
    slug: "prospects-en-cours",
    criteria: { deals: "open" },
  },
  SANS_NOUVELLES,
];

export const GENERIQUE_TARGETS: readonly TargetTemplate[] = [
  {
    slug: "tous-les-contacts",
    criteria: {},
  },
  {
    slug: "clients",
    criteria: { deals: "won" },
  },
  {
    slug: "prospects",
    criteria: { deals: "open" },
  },
  {
    slug: "societes",
    criteria: { kind: "company" },
  },
  SANS_NOUVELLES,
];
