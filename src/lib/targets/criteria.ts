import { z } from "zod";
import type { TranslatorOf } from "@/i18n/translator";

/**
 * LES CRITÈRES D'UN SEGMENT — le format stocké dans `mail_targets.criteria`
 * (jsonb), validé ici par zod avant toute écriture et à chaque lecture, et
 * compilé en SQL par UNE seule fonction (`segmentCondition`,
 * src/db/queries/mail-targets.ts) qui sert au compte, à la liste, à
 * l'appartenance d'un contact et à la photographie des destinataires.
 * `{}` = tous les contacts vivants de l'organisation.
 *
 * Chaque clé est un critère ; les critères se combinent par ET ; une liste
 * à l'intérieur d'un critère se lit « au moins un de ». Décision réversible
 * (étape 3) : des clés plates plutôt qu'un arbre de conditions ET/OU
 * imbriquées — l'éditeur reste lisible par un non-technicien (une ligne par
 * critère, une phrase par ligne) et tout ce que le cahier des charges nomme
 * s'exprime ainsi. Un OU entre critères différents (« à Lyon OU
 * investisseur ») se règle par deux cibles ; si ce besoin devient courant,
 * une clé `anyOf` pourra s'ajouter sans casser l'existant.
 *
 * Les libellés des sources et des présences d'affaires sont ceux de l'écran
 * ET de la description en une phrase (`describeCriteria`) : un seul
 * vocabulaire, jamais de jargon — dans les messages (`targets.sources`,
 * `targets.dealPresence`), pour la langue de la personne.
 */

export const CONTACT_SOURCES = ["manual", "import", "external", "lead"] as const;
export type ContactSource = (typeof CONTACT_SOURCES)[number];

export const DEAL_PRESENCES = ["any", "open", "won", "lost", "none"] as const;
export type DealPresence = (typeof DEAL_PRESENCES)[number];

/** Le traducteur du namespace `targets`, que l'appelant passe : la description ne sait pas d'où vient la langue. */
export type TargetsTranslator = TranslatorOf<"targets">;

const uuidList = z.array(z.uuid()).max(50);
const textList = z.array(z.string().trim().min(1).max(80)).max(20);
const days = z.number().int().min(1).max(3650);

export const SEGMENT_CRITERIA_SCHEMA = z.object({
  /** Personnes physiques ou morales ; absent = les deux. */
  kind: z.enum(["person", "company"]).optional(),
  /** Porte AU MOINS UNE de ces étiquettes. */
  tagsAny: uuidList.optional(),
  /** Ne porte AUCUNE de ces étiquettes. */
  tagsNone: uuidList.optional(),
  /** Ville parmi (insensible à la casse). */
  cities: textList.optional(),
  /** Pays parmi (insensible à la casse). */
  countries: textList.optional(),
  /** Conseiller attribué parmi. */
  ownerIds: uuidList.optional(),
  /** A une adresse email renseignée. */
  hasEmail: z.literal(true).optional(),
  /** Âge (personnes physiques avec date de naissance). */
  ageMin: z.number().int().min(0).max(120).optional(),
  ageMax: z.number().int().min(0).max(120).optional(),
  /** Présence d'affaires. */
  deals: z.enum(["any", "open", "won", "lost", "none"]).optional(),
  /** Au moins une affaire dans l'une de ces étapes. */
  dealStageIds: uuidList.optional(),
  /** Au moins une affaire dans l'un de ces pipelines. */
  dealPipelineIds: uuidList.optional(),
  /** Ancienneté de la fiche. */
  createdMoreThanDays: days.optional(),
  createdLessThanDays: days.optional(),
  /** Aucune interaction consignée depuis plus de N jours. */
  inactiveForDays: days.optional(),
  /** Origine de la fiche (comment elle est entrée dans la base). */
  sources: z.array(z.enum(["manual", "import", "external", "lead"])).optional(),
  /** Origine d'acquisition (un lead rattaché à l'une de ces origines). */
  originIds: uuidList.optional(),
});

export type SegmentCriteria = z.infer<typeof SEGMENT_CRITERIA_SCHEMA>;

/** Retire les clés vides (liste vide, indéfini) : `{}` reste `{}`, et deux cibles « tous les contacts » se ressemblent en base. */
export function normalizeCriteria(input: SegmentCriteria): SegmentCriteria {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key] = value;
  }
  return out as SegmentCriteria;
}

/** Valide une valeur inconnue (jsonb lu en base, JSON reçu d'un formulaire) ; `{}` si elle est illisible — jamais une cible qui casse un écran. */
export function parseCriteria(value: unknown): SegmentCriteria {
  const parsed = SEGMENT_CRITERIA_SCHEMA.safeParse(value ?? {});
  return parsed.success ? normalizeCriteria(parsed.data) : {};
}

export function isEmptyCriteria(criteria: SegmentCriteria): boolean {
  return Object.keys(normalizeCriteria(criteria)).length === 0;
}

/** Ce que l'éditeur et la description ont besoin de connaître pour nommer les choses. */
export type CriteriaOptions = {
  tags: { id: string; label: string }[];
  users: { id: string; name: string | null; email: string | null }[];
  pipelines: { id: string; label: string; stages: { id: string; label: string }[] }[];
  origins: { id: string; label: string }[];
  /** Valeurs déjà présentes dans les fiches — pour proposer, jamais pour restreindre. */
  cities: string[];
  countries: string[];
};

function joinOr(items: string[], t: TargetsTranslator): string {
  if (items.length <= 1) return items[0] ?? "";
  return t("criteria.joinOr", { list: items.slice(0, -1).join(", "), last: items[items.length - 1] });
}

function nameOf<T extends { id: string }>(list: T[], id: string, label: (item: T) => string, missing: string): string {
  const found = list.find((item) => item.id === id);
  return found ? label(found) : missing;
}

/**
 * Les critères en phrases courtes, dans l'ordre de l'éditeur — la même
 * description sur la liste des cibles, la page d'une cible, le composer et
 * la photographie d'un envoi. `[]` n'arrive jamais : sans critère, c'est
 * « Tous les contacts ».
 */
export function describeCriteria(criteria: SegmentCriteria, options: CriteriaOptions, t: TargetsTranslator): string[] {
  const c = normalizeCriteria(criteria);
  const out: string[] = [];
  const tagName = (id: string) => nameOf(options.tags, id, (t) => t.label, t("criteria.etiquette_supprimee"));
  const userName = (id: string) =>
    nameOf(options.users, id, (u) => u.name || u.email || t("criteria.un_conseiller"), t("criteria.conseiller_parti"));
  const stages = options.pipelines.flatMap((p) => p.stages.map((s) => ({ id: s.id, label: s.label })));

  if (c.kind === "person") out.push(t("criteria.personnes"));
  if (c.kind === "company") out.push(t("criteria.societes"));
  if (c.tagsAny?.length) {
    const labels = c.tagsAny.map(tagName);
    out.push(labels.length === 1 ? t("criteria.porte_l_etiquette", { value: labels[0] }) : t("criteria.porte_l_etiquette_31ed", { joinOr: joinOr(labels, t) }));
  }
  if (c.tagsNone?.length) out.push(t("criteria.sans_l_etiquette", { joinOr: joinOr(c.tagsNone.map(tagName), t) }));
  if (c.ageMin !== undefined && c.ageMax !== undefined) out.push(t("criteria.entre_et_ans", { ageMin: c.ageMin, ageMax: c.ageMax }));
  else if (c.ageMin !== undefined) out.push(t("criteria.ans_et_plus", { ageMin: c.ageMin }));
  else if (c.ageMax !== undefined) out.push(t("criteria.jusqu_a_ans", { ageMax: c.ageMax }));
  if (c.hasEmail) out.push(t("criteria.avec_une_adresse_email"));
  if (c.cities?.length) out.push(t("criteria.a", { joinOr: joinOr(c.cities, t) }));
  if (c.countries?.length) out.push(t("criteria.pays", { joinOr: joinOr(c.countries, t) }));
  if (c.ownerIds?.length) out.push(t("criteria.suivi_par", { joinOr: joinOr(c.ownerIds.map(userName), t) }));
  if (c.deals) {
    const presence = t(`dealPresence.${c.deals}`);
    out.push(presence.charAt(0).toLowerCase() + presence.slice(1));
  }
  if (c.dealStageIds?.length) {
    const labels = c.dealStageIds.map((id) => nameOf(stages, id, (s) => s.label, t("criteria.etape_supprimee")));
    out.push(labels.length === 1 ? t("criteria.affaire_dans_l_etape", { value: labels[0] }) : t("criteria.affaire_dans_l_etape_f806", { joinOr: joinOr(labels, t) }));
  }
  if (c.dealPipelineIds?.length) {
    out.push(
      t("criteria.affaire_dans_le_pipeline", { joinOr: joinOr(c.dealPipelineIds.map((id) => nameOf(options.pipelines, id, (p) => p.label, t("criteria.pipeline_supprime"))), t) })
    );
  }
  if (c.createdMoreThanDays !== undefined) out.push(t("criteria.fiche_creee_il_y_a_plus_9aad", { createdMoreThanDays: c.createdMoreThanDays }));
  if (c.createdLessThanDays !== undefined) out.push(t("criteria.fiche_creee_il_y_a_moins_fc42", { createdLessThanDays: c.createdLessThanDays }));
  if (c.inactiveForDays !== undefined) out.push(t("criteria.sans_interaction_depuis_plus_de_jours", { inactiveForDays: c.inactiveForDays }));
  if (c.sources?.length) {
    out.push(t("criteria.fiche_venue_de", { joinOr: joinOr(c.sources.map((s) => t(`sources.${s}`).toLowerCase()), t) }));
  }
  if (c.originIds?.length) {
    out.push(t("criteria.origine", { joinOr: joinOr(c.originIds.map((id) => nameOf(options.origins, id, (o) => o.label, t("criteria.origine_supprimee"))), t) }));
  }
  return out.length > 0 ? out : [t("criteria.tous_les_contacts")];
}

/** Les six facettes de l'identité éditoriale, dans l'ordre de l'écran et du prompt ; libellé et aide dans les messages (`targets.facets.<clé>`). */
export const IDENTITY_FACET_KEYS = ["persona", "concerns", "knowledgeLevel", "editorialVoice", "interests", "avoid"] as const;

export type IdentityFacetKey = (typeof IDENTITY_FACET_KEYS)[number];

/** Une identité est complète quand les six facettes sont remplies — l'écran montre ce qui manque (par clé, qu'il traduit), le prompt compose avec ce qui est là. */
export function missingIdentityFacets(target: Record<IdentityFacetKey, string | null>): IdentityFacetKey[] {
  return IDENTITY_FACET_KEYS.filter((key) => !target[key]?.trim());
}
