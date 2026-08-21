import type { NewsletterOutput } from "@/lib/newsletter/blocks";

/**
 * Contrat que le reste de l'app utilise pour générer une newsletter —
 * jamais un SDK vendeur en dur ailleurs que dans `anthropic.ts` (dossier de
 * reconstruction §3 : point d'extension si un second fournisseur apparaît).
 */
export interface AIProvider {
  designNewsletter(input: DesignNewsletterInput): Promise<NewsletterOutput>;
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
  /** Identité éditoriale complète de la cible — prime sur le ton générique de l'organisation. */
  editorialVoice: string;
};

export type SignatoryProfile = {
  name: string;
  jobTitle: string | null;
} | null;

/** Un chiffre vérifié de l'organisation (`verified_figures`), citable tel quel sans placeholder. */
export type VerifiedFigureProfile = {
  label: string;
  value: string;
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
