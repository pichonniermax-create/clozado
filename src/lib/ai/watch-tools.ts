import { z } from "zod";

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
