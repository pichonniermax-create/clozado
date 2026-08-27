import type { AnyBlock, NewsletterOutput, SourceItem } from "./blocks";
import type { SourceProfile } from "@/lib/ai/types";
import { findCopiedPassage, normalizeWords } from "@/lib/watch/originality";
import { canonicalUrl } from "@/lib/watch/url";

/**
 * Revue déterministe, sans IA — reprise du dossier de reconstruction (§8
 * point 6) : générer avec l'IA, puis vérifier avec du code déterministe.
 * Elle tourne après chaque génération (route de conception) ET en continu
 * dans l'éditeur, sur le document tel qu'il est : un chiffre tapé à la main
 * est vu comme un chiffre généré. Rien de ce qu'elle signale n'atteint
 * l'utilisateur silencieusement.
 *
 * Ce qu'elle vérifie (chantier « ciblage et contenu », étape 6) :
 * - les CHIFFRES : tout nombre qui n'est ni un chiffre vérifié de
 *   l'organisation (`verified_figures`, la même liste que le prompt), ni un
 *   `[placeholder]`, est signalé ; s'il vient d'un article de la matière
 *   (le nombre figure dans notre résumé ou le titre), il est signalé comme
 *   tel — un chiffre lu dans un article n'est pas vérifié par
 *   l'organisation. Les DATES (« 12 août 2026 », « T3 2026 », une année)
 *   ne sont pas des chiffres : elles sont retirées avant le comptage ;
 * - les SOURCES : chaque source citée est un article de la matière (liste
 *   blanche d'identifiants — `normalizeSourcesBlocks` recopie ses champs
 *   depuis la base et retire ce qui n'y est pas) ; un article rattaché et
 *   non cité est signalé ; un lien écrit dans le texte qui n'est pas une
 *   source rattachée aussi ;
 * - les FORMULATIONS : aucune suite de `COPY_WINDOW` mots normalisés d'un
 *   titre ou de NOTRE résumé d'un article ne se retrouve dans l'email
 *   (`originality.ts`, le même contrôle que celui des résumés à la
 *   collecte) — le composer n'a jamais le texte d'un article, il ne peut
 *   pas le reprendre ; ce qu'il a, il ne le recopie pas non plus ;
 * - un seul appel à l'action, l'objet et le préheader dans leurs longueurs.
 *
 * Les messages sont formulés par l'écran (`reviewMessage` dans l'éditeur)
 * depuis le code et les paramètres de chaque signalement : la revue reste
 * pure, sans traduction.
 */

export type ReviewIssue =
  | { code: "unauthorized_figure"; blockIndex: number; figure: string }
  | { code: "figure_from_source"; blockIndex: number; figure: string; sourceTitle: string }
  | { code: "copied_passage"; blockIndex?: number; sourceTitle: string; passage: string }
  | { code: "foreign_url"; blockIndex: number; url: string }
  | { code: "uncited_sources"; count: number }
  | { code: "unknown_source"; count: number }
  | { code: "sources_empty"; blockIndex: number }
  | { code: "multiple_ctas"; ctaCount: number }
  | { code: "subject_too_long"; count: number }
  | { code: "preheader_too_long"; count: number };

export type ReviewResult = {
  issues: ReviewIssue[];
};

/** Ce que la revue lit d'une source de la matière — la liste blanche et ce que le modèle a pu voir. */
export type ReviewSource = Pick<SourceProfile, "id" | "title" | "url" | "summary">;

export type ReviewInput = {
  subject: string;
  preheader: string;
  blocks: AnyBlock[];
};

export type ReviewOptions = {
  /**
   * Les chiffres vérifiés de l'organisation — leurs VALEURS et leurs
   * LIBELLÉS (« 3,2 % », « Taux moyen sur 20 ans » : le « 20 ans » du
   * libellé se cite avec la valeur), lus par l'appelant depuis
   * `verified_figures`, jamais une deuxième copie.
   */
  allowedFigures: string[];
  /** Les articles rattachés à la newsletter ; vide quand l'email ne part d'aucune matière. */
  sources?: ReviewSource[];
};

export const SUBJECT_MAX = 42;
export const PREHEADER_MAX = 85;
/** La longueur d'une suite de mots reprise d'un titre ou d'un résumé qui est signalée. */
export const COPY_WINDOW = 8;
/** Un titre plus court que la fenêtre est signalé s'il est repris en entier, dès quatre mots. */
const COPY_TITLE_MIN_WORDS = 4;

/** Champs de copie visibles par le lecteur, par type de bloc — c'est ce qu'on scanne. Les sources citées n'y sont pas : leurs champs viennent de la base. */
function copyFieldsOf(block: AnyBlock): string[] {
  switch (block.type) {
    case "titre":
      return [block.text, block.eyebrow];
    case "texte":
      return [block.text];
    case "chiffre_cle":
      return [block.value, block.label, block.caption];
    case "fiches":
      return block.cards.flatMap((c) => [c.title, c.text]);
    case "cta":
      return [block.title, block.text, block.buttonLabel];
    case "bouton":
      return [block.label];
    case "separateur":
      return [];
    case "sources":
      return [block.title];
  }
}

/** Les champs où un lien n'a rien à faire s'il n'est pas une source rattachée — un bouton ou un encart porte le lien de l'organisation, pas vérifié ici. */
function linkableCopyFieldsOf(block: AnyBlock): string[] {
  switch (block.type) {
    case "titre":
    case "texte":
    case "chiffre_cle":
    case "fiches":
      return copyFieldsOf(block);
    default:
      return [];
  }
}

/** Ne garde que les caractères numériques d'une chaîne, pour comparer "95 %" et "95%" sans divergence de format. */
function figureKey(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

/** Retire le contenu entre crochets (placeholders explicites, ex. "[apport %]") avant de chercher des chiffres. */
function stripPlaceholders(text: string): string {
  return text.replace(/\[[^\]]*\]/g, "");
}

/** Retire les numéros d'énumération en tête de champ ou de ligne (« 1. Avant de signer », « 2) … ») : un ordre, pas un chiffre. */
function stripEnumerations(text: string): string {
  return text.replace(/(^|\n)\s*\d{1,2}[.)]\s+/g, "$1 ");
}

// eslint-disable-next-line local/no-visible-text -- une expression régulière (les noms de mois, fr et en), pas un texte d'interface
const MONTHS = "janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre|janv\\.?|f[ée]vr\\.?|sept\\.?|oct\\.?|nov\\.?|d[ée]c\\.?|january|february|march|april|may|june|july|august|september|october|november|december|jan\\.?|feb\\.?|apr\\.?|aug\\.?|dec\\.?";

/**
 * Les DATES, retirées avant de chercher des chiffres : « 12 août 2026 »,
 * « 1er juin », « August 12, 2026 », « août 2026 », « 3e trimestre 2026 »,
 * « T3 2026 », « 2026-08-12 », « 12/08/2026 », et une année seule
 * (1900-2099). Une date n'est pas un chiffre au sens de la règle — c'est ce
 * qui accompagne chaque chiffre cité « valeur (source, date) ». Le prix
 * d'exactement 2 000 € y passerait aussi : accepté, et noté.
 */
const DATE_PATTERNS: RegExp[] = [
  new RegExp(`\\b\\d{1,2}(?:er|e)?\\s+(?:${MONTHS})(?:\\s+\\d{4})?`, "gi"),
  new RegExp(`\\b(?:${MONTHS})\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}\\b`, "gi"),
  new RegExp(`\\b(?:${MONTHS})\\s+\\d{4}\\b`, "gi"),
  /\b[1-4](?:er|e|st|nd|rd|th)?\s+(?:trimestre|quarter|semestre|half)\s+\d{4}\b/gi,
  /\b[TQSH][1-4]\s*\d{4}\b/gi,
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
  /\b(?:19|20)\d{2}\b/g,
];

export function stripDates(text: string): string {
  return DATE_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, " "), text);
}

/** Repère les figures numériques (montants, pourcentages, durées…) dans un texte. */
const FIGURE_PATTERN = /\d[\d\s.,]*\s?(%|€|k€|M€)?/g;

/** Les figures d'un texte, avec leur clé numérique — dates et placeholders retirés d'abord. */
function figuresOf(text: string): { raw: string; key: string }[] {
  const cleaned = stripDates(stripEnumerations(stripPlaceholders(text)));
  const out: { raw: string; key: string }[] = [];
  for (const raw of cleaned.match(FIGURE_PATTERN) ?? []) {
    const trimmed = raw.trim();
    const key = figureKey(trimmed);
    if (trimmed && key) out.push({ raw: trimmed, key });
  }
  return out;
}

const URL_PATTERN = /https?:\/\/[^\s<>"'`)\]»]+/gi;

/** Un lien écrit dans une phrase traîne souvent la ponctuation qui suit (« …/taux-juillet. ») : elle n'en fait pas partie. */
function trimUrl(url: string): string {
  return url.replace(/[.,;:!?…]+$/, "");
}

/** La première suite de mots de `field` reprise d'un titre ou d'un résumé de la matière. */
function copiedFrom(field: string, sources: ReviewSource[]): { sourceTitle: string; passage: string } | null {
  if (!field.trim()) return null;
  for (const source of sources) {
    if (source.summary) {
      const passage = findCopiedPassage(field, source.summary, COPY_WINDOW);
      if (passage) return { sourceTitle: source.title, passage };
    }
    const titleWords = normalizeWords(source.title).length;
    if (titleWords >= COPY_TITLE_MIN_WORDS) {
      const passage = findCopiedPassage(field, source.title, Math.min(COPY_WINDOW, titleWords));
      if (passage) return { sourceTitle: source.title, passage };
    }
  }
  return null;
}

export function reviewNewsletter(input: ReviewInput, opts: ReviewOptions): ReviewResult {
  const issues: ReviewIssue[] = [];
  const sources = opts.sources ?? [];
  // La valeur entière (« 1 250 » → 1250) et chaque nombre qu'elle ou son libellé contient (« sur 20 ans » → 20).
  const allowedKeys = new Set(opts.allowedFigures.flatMap((f) => [figureKey(f), ...figuresOf(f).map((x) => x.key)]).filter(Boolean));
  // Les chiffres que la matière contient (nos résumés, les titres) : un tel chiffre dans l'email vient d'un article, pas des chiffres vérifiés.
  const sourceFigures = new Map<string, string>();
  for (const source of sources) {
    for (const figure of figuresOf(`${source.title}\n${source.summary ?? ""}`)) {
      if (!sourceFigures.has(figure.key)) sourceFigures.set(figure.key, source.title);
    }
  }
  const sourceUrls = new Set(sources.map((s) => canonicalUrl(s.url)).filter(Boolean));

  input.blocks.forEach((block, index) => {
    for (const field of copyFieldsOf(block)) {
      for (const figure of figuresOf(field)) {
        if (allowedKeys.has(figure.key)) continue;
        const sourceTitle = sourceFigures.get(figure.key);
        if (sourceTitle) issues.push({ code: "figure_from_source", blockIndex: index, figure: figure.raw, sourceTitle });
        else issues.push({ code: "unauthorized_figure", blockIndex: index, figure: figure.raw });
      }
      const copied = copiedFrom(field, sources);
      if (copied) issues.push({ code: "copied_passage", blockIndex: index, ...copied });
    }
    for (const field of linkableCopyFieldsOf(block)) {
      for (const raw of field.match(URL_PATTERN) ?? []) {
        const url = trimUrl(raw);
        const canonical = canonicalUrl(url);
        if (!canonical || !sourceUrls.has(canonical)) issues.push({ code: "foreign_url", blockIndex: index, url });
      }
    }
    if (block.type === "sources" && block.items.length === 0) issues.push({ code: "sources_empty", blockIndex: index });
  });

  for (const field of [input.subject, input.preheader]) {
    const copied = copiedFrom(field, sources);
    if (copied) issues.push({ code: "copied_passage", ...copied });
  }

  if (sources.length > 0) {
    const cited = new Set(input.blocks.flatMap((b) => (b.type === "sources" ? b.items.map((i) => i.id) : [])));
    const uncited = sources.filter((s) => !cited.has(s.id)).length;
    if (uncited > 0) issues.push({ code: "uncited_sources", count: uncited });
  }

  const ctaCount = input.blocks.filter((b) => b.type === "cta" || b.type === "bouton").length;
  if (ctaCount > 1) issues.push({ code: "multiple_ctas", ctaCount });

  if (input.subject.length > SUBJECT_MAX) issues.push({ code: "subject_too_long", count: input.subject.length });
  if (input.preheader.length > PREHEADER_MAX) issues.push({ code: "preheader_too_long", count: input.preheader.length });

  return { issues };
}

// ---------------------------------------------------------------------------
// La liste blanche des sources — le modèle propose, la base dicte
// ---------------------------------------------------------------------------

/** Un article de la matière → l'élément cité tel qu'il s'affiche (champs recopiés depuis la base). */
export function toSourceItem(source: Pick<SourceProfile, "id" | "title" | "url" | "publisher" | "date">): SourceItem {
  return { id: source.id, title: source.title, url: source.url, publisher: source.publisher, date: source.date };
}

/**
 * Après la génération : dans chaque bloc `sources`, ne garde que les
 * articles de la matière (par identifiant, dédoublonnés) et recopie leurs
 * champs depuis la base — jamais un titre reformulé ni un lien écrit de
 * mémoire par le modèle ; un bloc qui ne cite plus rien disparaît. Rend le
 * nombre d'éléments retirés, que la revue signale (`unknown_source`).
 */
export function normalizeSourcesBlocks<T extends { blocks: AnyBlock[] }>(
  output: T,
  sources: Pick<SourceProfile, "id" | "title" | "url" | "publisher" | "date">[]
): { output: T; dropped: number } {
  const byId = new Map(sources.map((s) => [s.id, s]));
  let dropped = 0;
  const blocks: AnyBlock[] = [];
  for (const block of output.blocks) {
    if (block.type !== "sources") {
      blocks.push(block);
      continue;
    }
    const seen = new Set<string>();
    const items: SourceItem[] = [];
    for (const item of block.items) {
      const known = byId.get(item.id);
      if (!known || seen.has(item.id)) {
        dropped++;
        continue;
      }
      seen.add(item.id);
      items.push(toSourceItem(known));
    }
    if (items.length > 0) blocks.push({ ...block, items });
  }
  return { output: { ...output, blocks }, dropped };
}

/** Coupe un texte à `maxLen`, sur un séparateur naturel si possible, sinon sur une frontière de mot. Jamais laissé à l'IA seule. */
export function clampText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const separators = [" — ", " – ", " : ", " | ", " - "];
  for (const sep of separators) {
    const idx = text.lastIndexOf(sep, maxLen);
    if (idx > 0) return text.slice(0, idx).trimEnd();
  }
  const idx = text.lastIndexOf(" ", maxLen);
  return (idx > 0 ? text.slice(0, idx) : text.slice(0, maxLen)).trimEnd();
}

export const clampSubject = (text: string) => clampText(text, SUBJECT_MAX);
export const clampPreheader = (text: string) => clampText(text, PREHEADER_MAX);

/** Le type de sortie complet, tel que la route le rend après normalisation. */
export type ReviewedNewsletter = NewsletterOutput;
