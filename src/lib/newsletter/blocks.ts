import { z } from "zod";

/**
 * SOURCE UNIQUE du modèle de blocs. Le schéma d'outil transmis à l'IA
 * (buildEmitNewsletterTool ci-dessous) est GÉNÉRÉ depuis les mêmes schémas
 * zod que ceux qui valident un bloc chargé depuis la base — jamais deux
 * définitions maintenues séparément. C'est la classe de bug que le dossier
 * de reconstruction du module équivalent documente en §8 point 3 : un
 * prompt qui décrit un type de bloc que l'IA ne peut techniquement pas
 * produire, parce que le schéma d'outil et le modèle de blocs avaient
 * divergé. Ici, ils ne peuvent pas diverger : il n'y a qu'une définition.
 *
 * 7 types en V1 (surface réduite) : titre, texte, chiffre_cle, fiches, cta,
 * bouton, separateur. `image`, `article` et `espace` existent dans le
 * dossier source mais dépendent de modules hors périmètre (panier veille,
 * bibliothèque d'images) ou n'apportent rien sans eux — ajouter un type plus
 * tard ne demande de toucher que ce fichier.
 */
export const BLOCK_TYPES = [
  "titre",
  "texte",
  "chiffre_cle",
  "fiches",
  "cta",
  "bouton",
  "separateur",
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

/** Libellés FR à l'usage de l'admin (UI, messages d'erreur) — pas de contenu de marque. */
export const BLOCK_LABELS: Record<BlockType, string> = {
  titre: "Titre",
  texte: "Texte",
  chiffre_cle: "Chiffre clé",
  fiches: "Fiches",
  cta: "Appel à l'action",
  bouton: "Bouton",
  separateur: "Séparateur",
};

/**
 * LA forme des blocs, écrite UNE SEULE FOIS et instanciée à deux niveaux
 * d'exigence via `required` :
 *
 * - `BLOCK_SCHEMAS` (required = `z.string().min(1)`) — ce qu'on exige d'une
 *   newsletter aboutie : sortie de l'IA, revue déterministe, envoi. Inchangé
 *   par rapport à avant ce refactor.
 * - `DRAFT_BLOCK_SCHEMAS` (required = `z.string()`) — ce qu'on tolère d'un
 *   BROUILLON en cours d'écriture. Un bloc qu'on vient d'insérer a
 *   forcément des champs vides ; l'aperçu live et l'enregistrement
 *   automatique doivent l'accepter, sinon l'éditeur ne peut ni s'afficher ni
 *   se sauvegarder tant que tout n'est pas rempli.
 *
 * Écrit en fabrique plutôt qu'en deux copies : ajouter un champ ou un type
 * ne se fait qu'ici, et les deux niveaux restent alignés par construction —
 * c'est la même discipline que le schéma d'outil IA généré depuis les mêmes
 * zod (voir le commentaire de tête de ce fichier).
 *
 * Seules les contraintes de CONTENU (texte non vide) varient. Les
 * contraintes de STRUCTURE (2 à 4 fiches, niveau de titre parmi 1/2/3)
 * s'appliquent aux deux : une fiche manquante n'est pas un champ à finir de
 * remplir, c'est une forme invalide.
 */
function buildBlockSchemas(required: z.ZodString) {
  const ficheCard = z.strictObject({
    title: required,
    text: required,
  });

  return {
    titre: z.strictObject({
      type: z.literal("titre"),
      text: required,
      level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      /** Kicker éditorial court (2-4 mots) pour un h1 ; vide ("") pour h2/h3. */
      eyebrow: z.string(),
    }),
    texte: z.strictObject({
      type: z.literal("texte"),
      text: required,
    }),
    chiffre_cle: z.strictObject({
      type: z.literal("chiffre_cle"),
      /** Chaîne exacte affichée (chiffre vérifié ou "[placeholder]"). */
      value: required,
      label: required,
      /** Légende optionnelle ; vide ("") si aucune — jamais absente sur une partie de la rangée. */
      caption: z.string(),
    }),
    fiches: z.strictObject({
      type: z.literal("fiches"),
      cards: z.array(ficheCard).min(2).max(4),
    }),
    cta: z.strictObject({
      type: z.literal("cta"),
      title: required,
      text: required,
      buttonLabel: required,
      url: required,
    }),
    bouton: z.strictObject({
      type: z.literal("bouton"),
      label: required,
      url: required,
    }),
    separateur: z.strictObject({
      type: z.literal("separateur"),
    }),
  };
}

/** Newsletter aboutie : tout champ de copie doit être rempli. */
export const BLOCK_SCHEMAS = buildBlockSchemas(z.string().min(1));

/** Brouillon en cours : les champs de copie peuvent être vides. */
export const DRAFT_BLOCK_SCHEMAS = buildBlockSchemas(z.string());

/**
 * Schéma de payload par type, SANS `type` (déjà porté par la colonne
 * `newsletter_blocks.type`). Écrit champ par champ plutôt que dérivé par une
 * boucle sur `BLOCK_TYPES` : appeler `.omit()` sur une union de schémas
 * zod distincts ne type-check pas (les surcharges génériques de `.omit`
 * divergent d'un schéma à l'autre) — un seul appel par type reste la forme
 * la plus simple qui type-check.
 *
 * Dérivé du niveau BROUILLON, délibérément : c'est ce schéma qui relit une
 * ligne `newsletter_blocks` au chargement, et une ligne enregistrée est par
 * nature un brouillon en cours. Le refuser parce qu'un champ est encore vide
 * rendrait impossible de rouvrir son propre travail.
 */
export const BLOCK_PAYLOAD_SCHEMAS = {
  titre: DRAFT_BLOCK_SCHEMAS.titre.omit({ type: true }),
  texte: DRAFT_BLOCK_SCHEMAS.texte.omit({ type: true }),
  chiffre_cle: DRAFT_BLOCK_SCHEMAS.chiffre_cle.omit({ type: true }),
  fiches: DRAFT_BLOCK_SCHEMAS.fiches.omit({ type: true }),
  cta: DRAFT_BLOCK_SCHEMAS.cta.omit({ type: true }),
  bouton: DRAFT_BLOCK_SCHEMAS.bouton.omit({ type: true }),
  separateur: DRAFT_BLOCK_SCHEMAS.separateur.omit({ type: true }),
} as const satisfies Record<BlockType, z.ZodTypeAny>;

export type BlockPayload<T extends BlockType> = z.infer<(typeof BLOCK_SCHEMAS)[T]>;

/**
 * Valide le payload jsonb d'un bloc chargé depuis `newsletter_blocks` contre
 * le schéma de son type. Lève une erreur claire plutôt que de laisser passer
 * une forme invalide jusqu'au renderer.
 */
export function parseBlockPayload(type: string, payload: unknown) {
  if (!(BLOCK_TYPES as readonly string[]).includes(type)) {
    throw new Error(`Type de bloc inconnu : "${type}".`);
  }
  const schema = BLOCK_PAYLOAD_SCHEMAS[type as BlockType];
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw new Error(`Payload invalide pour un bloc "${type}" : ${result.error.message}`);
  }
  return result.data;
}

/** Bloc vierge d'un type donné, pour "Ajouter un bloc" dans l'éditeur — jamais valide tel quel (champs requis vides), juste un point de départ à remplir. */
export function defaultBlock(type: BlockType): AnyBlock {
  switch (type) {
    case "titre":
      return { type: "titre", text: "", level: 2, eyebrow: "" };
    case "texte":
      return { type: "texte", text: "" };
    case "chiffre_cle":
      return { type: "chiffre_cle", value: "", label: "", caption: "" };
    case "fiches":
      return {
        type: "fiches",
        cards: [
          { title: "", text: "" },
          { title: "", text: "" },
        ],
      };
    case "cta":
      return { type: "cta", title: "", text: "", buttonLabel: "", url: "" };
    case "bouton":
      return { type: "bouton", label: "", url: "" };
    case "separateur":
      return { type: "separateur" };
  }
}

/**
 * Union discriminée de tous les blocs (type + payload), utilisée pour
 * valider une newsletter entière. Liste explicite plutôt que
 * `Object.values(BLOCK_SCHEMAS)` : le discriminant littéral de chaque
 * schéma (nécessaire à `discriminatedUnion`) ne survit pas à un passage par
 * un tableau non typé en tuple.
 */
export const BLOCK_UNION = z.discriminatedUnion("type", [
  BLOCK_SCHEMAS.titre,
  BLOCK_SCHEMAS.texte,
  BLOCK_SCHEMAS.chiffre_cle,
  BLOCK_SCHEMAS.fiches,
  BLOCK_SCHEMAS.cta,
  BLOCK_SCHEMAS.bouton,
  BLOCK_SCHEMAS.separateur,
]);

/** Même union, au niveau brouillon — voir `DRAFT_BLOCK_SCHEMAS`. */
export const DRAFT_BLOCK_UNION = z.discriminatedUnion("type", [
  DRAFT_BLOCK_SCHEMAS.titre,
  DRAFT_BLOCK_SCHEMAS.texte,
  DRAFT_BLOCK_SCHEMAS.chiffre_cle,
  DRAFT_BLOCK_SCHEMAS.fiches,
  DRAFT_BLOCK_SCHEMAS.cta,
  DRAFT_BLOCK_SCHEMAS.bouton,
  DRAFT_BLOCK_SCHEMAS.separateur,
]);

/** Ce que l'IA doit produire : objet, préheader, et la liste ordonnée des blocs. */
export const NEWSLETTER_OUTPUT_SCHEMA = z.strictObject({
  subject: z.string().min(1),
  preheader: z.string().min(1),
  blocks: z.array(BLOCK_UNION).min(1),
});

/**
 * Un BROUILLON : tout peut être vide, y compris la liste de blocs.
 *
 * C'est ce qui rend possibles l'aperçu d'un email encore vierge (on doit
 * voir la structure et la marque avant d'avoir écrit quoi que ce soit) et
 * l'enregistrement automatique en cours de frappe. La base l'acceptait déjà
 * — `subject` et `preheader` sont NULL-ables et zéro bloc est zéro ligne —
 * c'est uniquement ce schéma qui l'interdisait. Aucune migration.
 *
 * `NEWSLETTER_OUTPUT_SCHEMA` reste le niveau exigé de l'IA et de la revue
 * déterministe : un brouillon permissif ne relâche rien sur ce qui part.
 */
export const NEWSLETTER_DRAFT_SCHEMA = z.strictObject({
  subject: z.string(),
  preheader: z.string(),
  blocks: z.array(DRAFT_BLOCK_UNION),
});

export type NewsletterOutput = z.infer<typeof NEWSLETTER_OUTPUT_SCHEMA>;
export type NewsletterDraft = z.infer<typeof NEWSLETTER_DRAFT_SCHEMA>;
export type AnyBlock = z.infer<typeof DRAFT_BLOCK_UNION>;

/**
 * Le schéma d'outil `emit_newsletter` transmis à l'IA, GÉNÉRÉ depuis
 * NEWSLETTER_OUTPUT_SCHEMA — jamais écrit à la main en parallèle du modèle
 * de blocs.
 *
 * PAS de `strict: true` (vérifié empiriquement contre l'API, pas une
 * supposition) : l'union discriminée des 7 types de blocs se compile en
 * `oneOf` dans le JSON Schema généré par zod, et le validateur d'outil
 * strict d'Anthropic rejette ce mot-clé (`Schema type 'oneOf' is not
 * supported`) — appeler l'API avec `strict: true` sur ce schéma échoue
 * systématiquement en 400. Le filet de sécurité reste `NEWSLETTER_OUTPUT_
 * SCHEMA.parse(toolUse.input)` côté appelant (`anthropic.ts`) : jamais un
 * output d'outil transmis sans revalidation, strict ou non.
 */
export function buildEmitNewsletterTool() {
  const inputSchema = z.toJSONSchema(NEWSLETTER_OUTPUT_SCHEMA) as Record<string, unknown>;
  delete inputSchema.$schema;
  return {
    name: "emit_newsletter",
    description:
      "Émet la newsletter composée : objet, préheader, et la liste ordonnée des blocs.",
    input_schema: inputSchema,
  } as const;
}
