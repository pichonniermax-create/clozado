import { z } from "zod";
import { COMPETITOR_ANGLES } from "@/lib/watch/gap";

/**
 * Les OUTILS DE SORTIE de la veille — comme `buildEmitNewsletterTool` pour
 * le composer : le schéma JSON de l'outil est GÉNÉRÉ depuis le schéma zod
 * qui revalide ensuite la réponse. Aucun type vendeur ici ; seul
 * `anthropic.ts` resserre la frontière avec le SDK.
 */

/** Ce que le résumé d'un article rend : jamais un extrait, un résumé ORIGINAL — le contrôle des douze mots est fait ensuite par du code. */
export const SUMMARY_OUTPUT_SCHEMA = z.strictObject({
  readable: z.boolean(),
  summary: z.string(),
  themes: z.array(z.string()).max(4),
  angle: z.string().nullable(),
  lang: z.string().nullable(),
  publishedAt: z.string().nullable(),
});

export type SummaryOutput = z.infer<typeof SUMMARY_OUTPUT_SCHEMA>;

export function buildEmitSummaryTool() {
  const inputSchema = z.toJSONSchema(SUMMARY_OUTPUT_SCHEMA) as Record<string, unknown>;
  delete inputSchema.$schema;
  return {
    name: "emit_summary",
    description:
      "Rend le résumé original de l'article : readable (false si le texte n'est pas un article lisible), summary (deux ou trois phrases, avec tes mots), themes (libellés de sujets), angle, lang (code ISO 639-1), publishedAt (AAAA-MM-JJ, seulement si la date est écrite dans le texte, sinon null).",
    input_schema: inputSchema,
  } as const;
}

/** Ce que la recherche rend : la liste des résultats retenus, à l'URL exacte — le code ne garde que celles que le moteur a réellement renvoyées. */
export const ARTICLES_OUTPUT_SCHEMA = z.strictObject({
  articles: z
    .array(
      z.strictObject({
        url: z.string(),
        title: z.string(),
        publishedAt: z.string().nullable(),
        lang: z.string().nullable(),
        country: z.string().nullable(),
      })
    )
    .max(15),
});

export type ArticlesOutput = z.infer<typeof ARTICLES_OUTPUT_SCHEMA>;

export function buildEmitArticlesTool() {
  const inputSchema = z.toJSONSchema(ARTICLES_OUTPUT_SCHEMA) as Record<string, unknown>;
  delete inputSchema.$schema;
  return {
    name: "emit_articles",
    description:
      "Rend les résultats de recherche retenus : url (EXACTEMENT celle du résultat), title, publishedAt (AAAA-MM-JJ seulement si la date est explicite, sinon null), lang (code ISO 639-1), country (code ISO 3166-1 alpha-2 de l'éditeur, ou null).",
    input_schema: inputSchema,
  } as const;
}

/**
 * Ce que la classification des TITRES d'un concurrent rend (étape 5) :
 * pour chaque identifiant, le sujet principal (un sujet suivi, un sujet
 * déjà rencontré, ou un sujet nouveau court — null quand le titre
 * n'annonce pas un article) et l'angle, dans un registre fermé. Le modèle
 * ne reçoit que des titres publics : rien à reproduire.
 */
export const CLASSIFICATION_OUTPUT_SCHEMA = z.strictObject({
  items: z
    .array(
      z.strictObject({
        id: z.string(),
        subject: z.string().nullable(),
        angle: z.enum(COMPETITOR_ANGLES),
      })
    )
    .max(60),
});

export type ClassificationOutput = z.infer<typeof CLASSIFICATION_OUTPUT_SCHEMA>;

export function buildEmitClassificationTool() {
  const inputSchema = z.toJSONSchema(CLASSIFICATION_OUTPUT_SCHEMA) as Record<string, unknown>;
  delete inputSchema.$schema;
  return {
    name: "emit_classification",
    description:
      "Rend la classification de chaque titre : id (l'identifiant donné), subject (le sujet principal — un sujet suivi ou déjà rencontré repris EXACTEMENT, sinon un sujet nouveau de deux à quatre mots ; null si le titre n'annonce pas un article), angle (guide, news, figures, alert, comparison, opinion, promotion, testimonial, other).",
    input_schema: inputSchema,
  } as const;
}
