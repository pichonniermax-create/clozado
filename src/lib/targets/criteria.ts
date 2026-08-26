import { z } from "zod";

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
 * Les libellés ci-dessous sont ceux de l'écran ET de la description en une
 * phrase (`describeCriteria`) : un seul vocabulaire, jamais de jargon.
 */

export const CONTACT_SOURCE_LABELS = {
  manual: "Saisie à la main",
  import: "Import CSV",
  external: "Système externe",
  lead: "Arrivée par un lead",
} as const;

export type ContactSource = keyof typeof CONTACT_SOURCE_LABELS;

export const DEAL_PRESENCE_LABELS = {
  any: "Au moins une affaire, quelle qu'elle soit",
  open: "Au moins une affaire en cours",
  won: "Au moins une affaire gagnée",
  lost: "Au moins une affaire perdue",
  none: "Aucune affaire",
} as const;

export type DealPresence = keyof typeof DEAL_PRESENCE_LABELS;

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

function joinOr(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ou ${items[items.length - 1]}`;
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
export function describeCriteria(criteria: SegmentCriteria, options: CriteriaOptions): string[] {
  const c = normalizeCriteria(criteria);
  const out: string[] = [];
  const tagName = (id: string) => nameOf(options.tags, id, (t) => t.label, "(étiquette supprimée)");
  const userName = (id: string) =>
    nameOf(options.users, id, (u) => u.name || u.email || "un conseiller", "(conseiller parti)");
  const stages = options.pipelines.flatMap((p) => p.stages.map((s) => ({ id: s.id, label: s.label })));

  if (c.kind === "person") out.push("Personnes");
  if (c.kind === "company") out.push("Sociétés");
  if (c.tagsAny?.length) {
    const labels = c.tagsAny.map(tagName);
    out.push(labels.length === 1 ? `porte l'étiquette ${labels[0]}` : `porte l'étiquette ${joinOr(labels)}`);
  }
  if (c.tagsNone?.length) out.push(`sans l'étiquette ${joinOr(c.tagsNone.map(tagName))}`);
  if (c.ageMin !== undefined && c.ageMax !== undefined) out.push(`entre ${c.ageMin} et ${c.ageMax} ans`);
  else if (c.ageMin !== undefined) out.push(`${c.ageMin} ans et plus`);
  else if (c.ageMax !== undefined) out.push(`jusqu'à ${c.ageMax} ans`);
  if (c.hasEmail) out.push("avec une adresse email");
  if (c.cities?.length) out.push(`à ${joinOr(c.cities)}`);
  if (c.countries?.length) out.push(`pays : ${joinOr(c.countries)}`);
  if (c.ownerIds?.length) out.push(`suivi par ${joinOr(c.ownerIds.map(userName))}`);
  if (c.deals) out.push(DEAL_PRESENCE_LABELS[c.deals].charAt(0).toLowerCase() + DEAL_PRESENCE_LABELS[c.deals].slice(1));
  if (c.dealStageIds?.length) {
    const labels = c.dealStageIds.map((id) => nameOf(stages, id, (s) => s.label, "(étape supprimée)"));
    out.push(labels.length === 1 ? `affaire dans l'étape ${labels[0]}` : `affaire dans l'étape ${joinOr(labels)}`);
  }
  if (c.dealPipelineIds?.length) {
    out.push(
      `affaire dans le pipeline ${joinOr(c.dealPipelineIds.map((id) => nameOf(options.pipelines, id, (p) => p.label, "(pipeline supprimé)")))}`
    );
  }
  if (c.createdMoreThanDays !== undefined) out.push(`fiche créée il y a plus de ${c.createdMoreThanDays} jours`);
  if (c.createdLessThanDays !== undefined) out.push(`fiche créée il y a moins de ${c.createdLessThanDays} jours`);
  if (c.inactiveForDays !== undefined) out.push(`sans interaction depuis plus de ${c.inactiveForDays} jours`);
  if (c.sources?.length) {
    out.push(`fiche venue de : ${joinOr(c.sources.map((s) => CONTACT_SOURCE_LABELS[s].toLowerCase()))}`);
  }
  if (c.originIds?.length) {
    out.push(`origine : ${joinOr(c.originIds.map((id) => nameOf(options.origins, id, (o) => o.label, "(origine supprimée)")))}`);
  }
  return out.length > 0 ? out : ["Tous les contacts"];
}

/** Les six facettes de l'identité éditoriale, dans l'ordre de l'écran et du prompt — un seul vocabulaire ici. */
export const IDENTITY_FACETS = [
  { key: "persona", label: "Qui est cette personne", hint: "Une ou deux phrases : sa situation, ce qu'elle vit en ce moment." },
  { key: "concerns", label: "Ce qui la préoccupe", hint: "Les questions qu'elle se pose vraiment — c'est à elles que l'email répond." },
  { key: "knowledgeLevel", label: "Son niveau de connaissance du sujet", hint: "Débutant, averti, expert : ce qui décide de ce qu'on explique et de ce qu'on ne réexplique pas." },
  { key: "editorialVoice", label: "Le ton à adopter", hint: "Comment on lui parle : pédagogue, direct, complice…" },
  { key: "interests", label: "Ce qui l'intéresse", hint: "Les sujets qui la font ouvrir un email." },
  { key: "avoid", label: "Ce qu'on ne lui dit pas", hint: "Ce qui ferait un email à côté : le jargon, les sujets hors de sa situation, les promesses." },
] as const;

export type IdentityFacetKey = (typeof IDENTITY_FACETS)[number]["key"];

/** Une identité est complète quand les six facettes sont remplies — l'écran montre ce qui manque, le prompt compose avec ce qui est là. */
export function missingIdentityFacets(target: Record<IdentityFacetKey, string | null>): string[] {
  return IDENTITY_FACETS.filter((f) => !target[f.key]?.trim()).map((f) => f.label);
}
