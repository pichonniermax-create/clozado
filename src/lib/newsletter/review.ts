import type { AnyBlock, NewsletterOutput } from "./blocks";
import type { TranslatorOf } from "@/i18n/translator";

/**
 * Revue déterministe, sans IA, exécutée après chaque génération — reprise
 * telle quelle du dossier de reconstruction (§8 point 6) : générer avec
 * l'IA, puis vérifier avec du code déterministe, et ne garder le résultat
 * que s'il n'aggrave pas la mesure. Aucun chiffre non autorisé ne doit
 * pouvoir atteindre l'utilisateur silencieusement.
 *
 * La liste des chiffres autorisés (`allowedFigures`) est lue par l'appelant
 * depuis `verified_figures` — la même table que le compositeur de prompt
 * utilise pour lister les chiffres utilisables. Jamais une deuxième copie.
 */

export type ReviewIssue = {
  code: "unauthorized_figure" | "multiple_ctas" | "subject_too_long" | "preheader_too_long";
  message: string;
  blockIndex?: number;
};

export type ReviewResult = {
  issues: ReviewIssue[];
};

export const SUBJECT_MAX = 42;
export const PREHEADER_MAX = 85;

/** Champs de copie visibles par le lecteur, par type de bloc — c'est ce qu'on scanne. */
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

/** Repère les figures numériques (montants, pourcentages, durées…) dans un texte. */
const FIGURE_PATTERN = /\d[\d\s.,]*\s?(%|€|k€|M€)?/g;

function findUnauthorizedFigures(text: string, allowedKeys: Set<string>): string[] {
  const cleaned = stripPlaceholders(text);
  const matches = cleaned.match(FIGURE_PATTERN) ?? [];
  const unauthorized: string[] = [];
  for (const raw of matches) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = figureKey(trimmed);
    if (!key) continue;
    if (!allowedKeys.has(key)) {
      unauthorized.push(trimmed);
    }
  }
  return unauthorized;
}

export function reviewNewsletter(
  output: NewsletterOutput,
  allowedFigures: string[],
  t: TranslatorOf<"newsletters.review">
): ReviewResult {
  const issues: ReviewIssue[] = [];
  const allowedKeys = new Set(allowedFigures.map(figureKey).filter(Boolean));

  output.blocks.forEach((block, index) => {
    for (const field of copyFieldsOf(block)) {
      for (const figure of findUnauthorizedFigures(field, allowedKeys)) {
        issues.push({
          code: "unauthorized_figure",
          message: t("chiffre_non_autorise_dans_un_bloc_3f72", { figure, type: block.type }),
          blockIndex: index,
        });
      }
    }
  });

  const ctaCount = output.blocks.filter((b) => b.type === "cta" || b.type === "bouton").length;
  if (ctaCount > 1) {
    issues.push({
      code: "multiple_ctas",
      message: t("blocs_d_appel_a_l_action_c471", { ctaCount }),
    });
  }

  if (output.subject.length > SUBJECT_MAX) {
    issues.push({
      code: "subject_too_long",
      message: t("objet_de_caracteres_maximum", { count: output.subject.length, subjectMax: SUBJECT_MAX }),
    });
  }
  if (output.preheader.length > PREHEADER_MAX) {
    issues.push({
      code: "preheader_too_long",
      message: t("preheader_de_caracteres_maximum", { count: output.preheader.length, preheaderMax: PREHEADER_MAX }),
    });
  }

  return { issues };
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
