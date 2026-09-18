/* eslint-disable local/no-visible-text -- des messages de configuration lus par l'exploitant dans le journal du serveur, jamais par une personne à l'écran */
import { z } from "zod";
import { log } from "@/lib/log";

/**
 * LES VARIABLES D'ENVIRONNEMENT (chantier audit et production-ready,
 * étape 2, constat D12) — déclarées une fois, validées AU DÉMARRAGE du
 * serveur (`src/instrumentation.ts`, runtime Node.js seulement) plutôt que
 * découvertes à l'usage, une par une, par un écran qui plante.
 *
 * Deux niveaux :
 * - sans DATABASE_URL, AUTH_SECRET ou EMAIL_FROM, AUCUNE page ne
 *   fonctionne (base, sessions et chiffrement, expéditeur du lien de
 *   connexion évalué à la première demande) : le démarrage refuse, avec le
 *   nom de ce qui manque ;
 * - les autres désactivent une fonction précise : un AVERTISSEMENT
 *   journalisé dit laquelle, et le produit démarre.
 *
 * Le build (`next build`) n'appelle pas cette validation : il n'a besoin
 * d'aucune de ces variables au-delà de ce qu'il exigeait déjà. Les lecteurs
 * à l'usage (`src/lib/email/config.ts`, `src/lib/ai/index.ts`…) restent :
 * cette validation prévient, ils garantissent.
 */
const optional = z.string().trim().optional();

export const ENV_SCHEMA = z.object({
  // --- Sans elles, rien ne fonctionne ---
  /** La base Postgres (Neon) — `src/db/index.ts` la lit à l'import. */
  DATABASE_URL: z.string().trim().min(1),
  /** Les sessions Auth.js, la session de visite de la démo, le chiffrement des secrets en base. */
  AUTH_SECRET: z.string().trim().min(1),
  /** L'expéditeur des emails du produit (lien de connexion) — une adresse réelle sur le sous-domaine mutualisé. */
  EMAIL_FROM: z.string().trim().min(1),

  // --- Chacune désactive une fonction quand elle manque ---
  EMAIL_SHARED_DOMAIN: optional,
  EMAIL_INBOUND_DOMAIN: optional,
  APP_URL: optional,
  RESEND_API_KEY: optional,
  RESEND_WEBHOOK_SECRET: optional,
  /** Séparation des flux (audit newsletter du 2026-09-17, §B.8) : le second compte, pour tout ce qui part au nom d'une organisation. */
  RESEND_MARKETING_API_KEY: optional,
  EMAIL_MARKETING_DOMAIN: optional,
  RESEND_MARKETING_WEBHOOK_SECRET: optional,
  CRON_SECRET: optional,
  ANTHROPIC_API_KEY: optional,
  ANTHROPIC_MODEL: optional,
  ANTHROPIC_WATCH_MODEL: optional,
  /** L'agenda Google du module de réservation (chantier réservation) : le client OAuth, puis le jeton obtenu par /api/google/connect. */
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  GOOGLE_REFRESH_TOKEN: optional,
  GOOGLE_CALENDAR_ID: optional,
  AUTH_TRUST_HOST: optional,
  /** Base LOCALE de preuve uniquement (docs/module-demo.md §1.5) : jamais en production. */
  DATABASE_HTTP_ENDPOINT: optional,
});

export type Env = z.infer<typeof ENV_SCHEMA>;

export const REQUIRED_VARIABLES = ["DATABASE_URL", "AUTH_SECRET", "EMAIL_FROM"] as const;

/** Ce que l'absence de chaque variable facultative désactive — la phrase de l'avertissement. */
export const OPTIONAL_VARIABLES: { name: keyof Env; disables: string }[] = [
  { name: "RESEND_API_KEY", disables: "tout envoi d'email (lien de connexion, newsletters, relances) et la vérification des domaines" },
  { name: "EMAIL_SHARED_DOMAIN", disables: "l'expéditeur de repli des organisations sans domaine vérifié (les envois au nom d'une organisation refusent)" },
  { name: "EMAIL_INBOUND_DOMAIN", disables: "les adresses d'ingestion des emails reçus" },
  { name: "APP_URL", disables: "les liens absolus composés hors requête (désinscription depuis le cron, webhooks) — repli sur l'origine de la requête" },
  { name: "RESEND_WEBHOOK_SECRET", disables: "les webhooks Resend (suivi des ouvertures, clics, rebonds, emails reçus) — refusés en 503" },
  { name: "RESEND_MARKETING_API_KEY", disables: "l'isolation du flux marketing : les newsletters et les relances partent par le compte transactionnel, celui des liens de connexion" },
  { name: "EMAIL_MARKETING_DOMAIN", disables: "le domaine mutualisé propre au flux marketing : le repli reste EMAIL_SHARED_DOMAIN" },
  { name: "RESEND_MARKETING_WEBHOOK_SECRET", disables: "les webhooks du compte marketing (suivi des newsletters et relances quand le flux est isolé)" },
  { name: "GOOGLE_CLIENT_ID", disables: "le raccordement à l'agenda Google : /api/google/connect refuse (503), et la page de réservation n'a aucun créneau à proposer" },
  { name: "GOOGLE_CLIENT_SECRET", disables: "le raccordement à l'agenda Google : l'échange du code de consentement est impossible" },
  { name: "GOOGLE_REFRESH_TOKEN", disables: "la lecture des disponibilités et la création des rendez-vous : il s'obtient une fois par /api/google/connect" },
  { name: "GOOGLE_CALENDAR_ID", disables: "l'agenda visé par les créneaux et les rendez-vous — sans lui, aucun créneau n'est proposé" },
  { name: "CRON_SECRET", disables: "les crons (envois repris, veille) — refusés en 503" },
  { name: "ANTHROPIC_API_KEY", disables: "l'IA (composer de newsletters, veille, signature des emails reçus) — le déterministe seul" },
  { name: "ANTHROPIC_MODEL", disables: "rien : le modèle par défaut du composer sert" },
  { name: "ANTHROPIC_WATCH_MODEL", disables: "rien : le modèle du composer (ou celui par défaut) sert à la veille" },
  { name: "AUTH_TRUST_HOST", disables: "rien sur Vercel (l'hôte y est de confiance) ; requis hors Vercel pour qu'Auth.js accepte l'hôte" },
  { name: "DATABASE_HTTP_ENDPOINT", disables: "rien : réservée à la base locale de preuve" },
];

export class EnvError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(
      `Variables d'environnement manquantes : ${missing.join(", ")}. Sans elles aucune page ne fonctionne — voir .env.example (copie en .env.local en local, variables du projet sur Vercel).`
    );
    this.name = "EnvError";
    this.missing = missing;
  }
}

export type EnvReport = { env: Env; warnings: string[] };

/**
 * Lit et valide `source` (par défaut `process.env`). Lève `EnvError` si
 * une variable indispensable manque ; rend la liste des avertissements
 * (une phrase par variable facultative absente) sans les journaliser —
 * c'est `validateEnv` qui journalise.
 */
export function readEnv(source: Record<string, string | undefined> = process.env): EnvReport {
  const parsed = ENV_SCHEMA.safeParse(source);
  if (!parsed.success) {
    const missing = REQUIRED_VARIABLES.filter((name) => !source[name]?.trim());
    // Une variable indispensable présente mais illisible n'existe pas ici (toutes sont des chaînes) : c'est forcément une absence.
    throw new EnvError(missing.length > 0 ? [...missing] : parsed.error.issues.map((issue) => issue.path.join(".")));
  }
  const env = parsed.data;
  const warnings = OPTIONAL_VARIABLES.filter(({ name }) => !env[name]).map(({ name, disables }) => `${name} absente : ${disables}.`);
  return { env, warnings };
}

/** Au démarrage : lève si l'indispensable manque, journalise un avertissement par fonction désactivée. */
export function validateEnv(source: Record<string, string | undefined> = process.env): EnvReport {
  const report = readEnv(source);
  if (report.warnings.length > 0) {
    log.warn("env_optional_missing", { count: report.warnings.length, warnings: report.warnings });
  }
  return report;
}
