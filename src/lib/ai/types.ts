import type { NewsletterOutput } from "@/lib/newsletter/blocks";

/**
 * Contrat que le reste de l'app utilise pour générer une newsletter —
 * jamais un SDK vendeur en dur ailleurs que dans `anthropic.ts` (dossier de
 * reconstruction §3 : point d'extension si un second fournisseur apparaît).
 */
export interface AIProvider {
  designNewsletter(input: DesignNewsletterInput): Promise<NewsletterOutput>;
  /**
   * La veille (chantier « ciblage et contenu ») : un résumé ORIGINAL d'un
   * article lu à l'instant — le texte d'origine est rendu avec le résumé
   * pour le contrôle déterministe d'originalité, et n'est jamais stocké.
   */
  summarizeArticle(input: SummarizeArticleInput): Promise<ArticleSummary>;
  /** Une recherche web bornée (un sujet, une langue, un pays, des domaines) : seules les URL réellement renvoyées par le moteur sont rendues. */
  searchArticles(input: SearchArticlesInput): Promise<SearchArticlesResult>;
  /**
   * Même génération, mais en rendant compte de son avancement : `onProgress`
   * est appelé à chaque fois qu'un morceau supplémentaire du JSON d'outil
   * est arrivé, avec le texte accumulé depuis le début.
   *
   * L'appelant décide quoi en faire (voir `parsePartialNewsletter`). La
   * valeur RENDUE reste la sortie complète et validée : ce qui transite par
   * `onProgress` est provisoire et n'a pas encore traversé la revue.
   */
  designNewsletterStreaming(
    input: DesignNewsletterInput,
    onProgress: (accumulatedJson: string) => void
  ): Promise<NewsletterOutput>;
}

/**
 * Profil éditorial de l'organisation, tel qu'injecté dans le prompt système.
 * Toutes les valeurs viennent de `organizations` — jamais un nom de marque,
 * un ton ou une règle métier écrit en dur dans `anthropic.ts` (contrairement
 * au module d'origine, cf. dossier de reconstruction §4.2/§7.2).
 */
export type OrganizationProfile = {
  name: string;
  tagline: string | null;
  toneOfVoice: string | null;
  /** Règles/interdits/contexte métier libres (ex: pas de conseil juridique catégorique). */
  editorialGuidelines: string | null;
};

/** Cible/persona (`mail_targets`) vers laquelle la newsletter est écrite. */
export type TargetProfile = {
  label: string;
  persona: string | null;
  audienceLabel: string | null;
  /** Le ton et la voix à adopter pour cette cible — prime sur le ton générique de l'organisation ; NULL tant que l'identité n'est pas remplie. */
  editorialVoice: string | null;
};

export type SignatoryProfile = {
  name: string;
  jobTitle: string | null;
} | null;

/**
 * Un chiffre vérifié de l'organisation (`verified_figures`), citable tel
 * quel sans placeholder — TOUJOURS avec sa source et sa date (chantier
 * « ciblage et contenu ») : un chiffre qui n'a ni l'une ni l'autre n'est
 * pas transmis au modèle.
 */
export type VerifiedFigureProfile = {
  label: string;
  value: string;
  sourceName: string;
  asOf: string;
};

// ---------------------------------------------------------------------------
// La veille : résumé original et recherche bornée
// ---------------------------------------------------------------------------

export type SummarizeArticleInput = {
  url: string;
  title: string;
  publisher: string;
  /** Le texte lu à l'instant par la veille (jamais stocké). Absent : le fournisseur lit la page lui-même. */
  text?: string;
  /** Les sujets déclarés de l'organisation, pour classer l'article. */
  topics: string[];
};

export type ArticleSummary = {
  /** false : la page n'était pas un article lisible (menu, accueil, page vide) — rien à résumer. */
  readable: boolean;
  summary: string;
  themes: string[];
  angle: string | null;
  lang: string | null;
  /** AAAA-MM-JJ si la date est écrite dans le texte, sinon null — jamais une date déduite. */
  publishedAt: string | null;
  /** Le texte d'origine sur lequel le résumé a été écrit — pour le contrôle des douze mots ; jamais stocké. */
  originalText: string;
  model: string;
};

export type SearchArticlesInput = {
  query: string;
  lang: "fr" | "en";
  /** Le pays qui oriente la recherche (ISO 3166-1 alpha-2). */
  country: string;
  /** Restreint la recherche à ces domaines (une source déclarée sans flux). */
  allowedDomains?: string[];
  maxResults: number;
};

export type SearchedArticle = {
  url: string;
  title: string;
  /** AAAA-MM-JJ quand la date est explicite, sinon null. */
  publishedAt: string | null;
  /** L'âge de la page tel que le moteur le donne (« July 24, 2026 », « 3 weeks ago ») — lu par du code, jamais stocké tel quel. */
  pageAge: string | null;
  lang: string | null;
  country: string | null;
};

export type SearchArticlesResult = {
  articles: SearchedArticle[];
  /** Le nombre de recherches facturées par le fournisseur. */
  searches: number;
  model: string;
};

export type DesignNewsletterInput = {
  organization: OrganizationProfile;
  target: TargetProfile;
  signatory: SignatoryProfile;
  /** Chiffres autorisés de l'organisation — même liste que `reviewNewsletter` vérifie ensuite. */
  verifiedFigures: VerifiedFigureProfile[];
  lang: "fr" | "en";
  brief: string;
  /** Cible de volume approximative du corps, en caractères (espaces compris). */
  targetLength?: { label: string; ideal: number; min: number; max: number };
};

/** Levée par `getAIProvider()` quand `ANTHROPIC_API_KEY` est absente — jamais un provider silencieusement inopérant. */
export class AINotConfiguredError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY absente : le fournisseur IA n'est pas configuré.");
    this.name = "AINotConfiguredError";
  }
}

/**
 * Levée quand la réponse s'arrête sur `max_tokens` — jamais un JSON d'outil
 * amputé renvoyé silencieusement à l'appelant (bug historique documenté au
 * dossier de reconstruction §4.1 : "long mail displayed incomplete").
 */
export class AITruncatedError extends Error {
  constructor() {
    super("Réponse IA tronquée (max_tokens atteint) — nouvelle tentative nécessaire.");
    this.name = "AITruncatedError";
  }
}
