import { z } from "zod";

/**
 * L'OUTIL DE SORTIE de la signature d'un email reçu (chantier engagement,
 * docs/module-engagement.md §4.3) — même principe que les outils de la
 * veille : le schéma JSON de l'outil est GÉNÉRÉ depuis le schéma zod qui
 * revalide ensuite la réponse. Le modèle PROPOSE, il ne décide rien : sa
 * sortie est bornée à quatre champs et à un score, et c'est une personne
 * qui confirme. Aucun type vendeur ici.
 */

/** Un champ proposé : la valeur telle qu'elle est ÉCRITE dans les lignes fournies, et la confiance (0 à 1). */
const PROPOSED_FIELD = z.strictObject({
  value: z.string(),
  confidence: z.number(),
});

export const SIGNATURE_OUTPUT_SCHEMA = z.strictObject({
  name: PROPOSED_FIELD.nullable(),
  phone: PROPOSED_FIELD.nullable(),
  company: PROPOSED_FIELD.nullable(),
  jobTitle: PROPOSED_FIELD.nullable(),
});

export type SignatureOutput = z.infer<typeof SIGNATURE_OUTPUT_SCHEMA>;

export function buildExtractSignatureTool() {
  const inputSchema = z.toJSONSchema(SIGNATURE_OUTPUT_SCHEMA) as Record<string, unknown>;
  delete inputSchema.$schema;
  return {
    name: "extract_signature",
    description:
      "Rend ce que la signature du message contient, et RIEN d'autre : name (la personne qui signe), phone (son téléphone), company (sa société), jobTitle (sa fonction). Chaque champ porte value — recopiée EXACTEMENT depuis les lignes fournies, jamais reformulée ni devinée — et confidence entre 0 et 1. Un champ absent des lignes vaut null. Sans signature du tout, les quatre champs valent null.",
    input_schema: inputSchema,
  } as const;
}
