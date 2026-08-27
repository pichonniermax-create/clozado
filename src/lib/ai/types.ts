import type { NewsletterOutput } from "@/lib/newsletter/blocks";
import type { CompetitorAngle } from "@/lib/watch/gap";

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
   * La veille concurrentielle (étape 5) : le sujet et l'angle de chaque
   * article d'un concurrent, classés depuis son TITRE public — le modèle
   * ne reçoit ni texte ni résumé, et n'en rend pas. Un appel pour un lot
   * de titres.
   */
  classifyTitles(input: ClassifyTitlesInput): Promise<ClassifyTitlesResult>;
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

/**
 * La cible (`mail_targets`) vers laquelle la newsletter est écrite : son
 * libellé et son IDENTITÉ ÉDITORIALE EN SIX FACETTES (chantier « ciblage et
 * contenu », étape 6) — le prompt se compose depuis ce qui est rempli, une
 * facette vide n'y figure pas ; aucune formulation de cible n'est écrite
 * en dur dans le fournisseur.
 */
export type TargetProfile = {
  label: string;
  audienceLabel: string | null;
  /** Qui lit. */
  persona: string | null;
  /** Ce qui préoccupe cette personne. */
  concerns: string | null;
  /** Ce qu'elle sait déjà du sujet. */
  knowledgeLevel: string | null;
  /** Ce qui l'intéresse. */
  interests: string | null;
  /** Le ton et la voix à adopter pour elle — prime sur le ton générique de l'organisation. */
  editorialVoice: string | null;
  /** Ce qu'on ne lui dit pas. */
  avoid: string | null;
};

/**
 * Un article de la MATIÈRE (les articles rattachés à la newsletter) tel que
 * le composer le reçoit : ce qui est en base et rien d'autre — jamais le
 * texte de l'article, qui n'existe pas en base (règle de droit d'auteur).
 * `id` est la liste blanche : un bloc `sources` ne peut citer que ces
 * identifiants, et ses champs sont recopiés depuis ici par le serveur.
 */
export type SourceProfile = {
  id: string;
  title: string;
  publisher: string;
  /** La date telle qu'elle s'affiche dans la langue des contenus (« 12 août 2026 »), vide si inconnue. */
  date: string;
  url: string;
  /** NOTRE résumé (écrit avec nos mots à la collecte), null s'il n'existe pas encore. */
  summary: string | null;
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

export type ClassifyTitlesInput = {
  /** La langue dans laquelle un sujet nouveau s'écrit — celle de l'organisation. */
  lang: "fr" | "en";
  /** Les sujets suivis par l'organisation (libellés exacts) : un article qui en traite principalement y est classé. */
  topics: string[];
  /** Les sujets déjà donnés à d'autres articles de concurrents de cette organisation : le même sujet s'écrit toujours pareil. */
  knownSubjects: string[];
  items: { id: string; title: string; publisher: string }[];
};

export type TitleClassification = {
  id: string;
  /** Null : le titre n'annonce pas un article (accueil, rubrique, mention légale…). */
  subject: string | null;
  angle: CompetitorAngle;
};

export type ClassifyTitlesResult = {
  items: TitleClassification[];
  model: string;
};

export type DesignNewsletterInput = {
  organization: OrganizationProfile;
  target: TargetProfile;
  signatory: SignatoryProfile;
  /** Chiffres autorisés de l'organisation — même liste que `reviewNewsletter` vérifie ensuite. */
  verifiedFigures: VerifiedFigureProfile[];
  /** La matière : les articles rattachés (titres, liens, dates, nos résumés) — la liste blanche des sources citables. */
  sources: SourceProfile[];
  /** Les sujets déjà traités dans les derniers envois à cette cible — l'anti-répétition, dite au modèle. */
  recentTopics: string[];
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
