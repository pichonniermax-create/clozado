import { headers } from "next/headers";

/**
 * La configuration de l'envoi (chantier engagement, docs/module-engagement.md
 * §2 et §7) — rien n'est en dur : les domaines de la plateforme et
 * l'expéditeur du produit viennent des variables d'environnement, et une
 * variable absente est une erreur dite en clair, jamais un repli silencieux
 * (« plus jamais onboarding@resend.dev »).
 */

/** Une variable exigée : absente = le produit refuse d'envoyer et le dit. */
function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new EmailConfigError(name);
  return value;
}

export class EmailConfigError extends Error {
  readonly variable: string;
  constructor(variable: string) {
    // eslint-disable-next-line local/no-visible-text -- message technique de configuration, jamais affiché à une personne
    super(`email: la variable d'environnement ${variable} est absente`);
    this.name = "EmailConfigError";
    this.variable = variable;
  }
}

/** L'expéditeur des emails du PRODUIT (lien de connexion, notifications à une personne) : « Clozado <connexion@mail.clozado.fr> ». */
export function productMailbox(): string {
  return required("EMAIL_FROM");
}

/** Le sous-domaine mutualisé d'envoi — le repli de toute organisation sans domaine vérifié. */
export function sharedSendingDomain(): string {
  return required("EMAIL_SHARED_DOMAIN").toLowerCase();
}

/** Le domaine de réception des adresses d'ingestion (Partie 2). */
export function inboundDomain(): string {
  return required("EMAIL_INBOUND_DOMAIN").toLowerCase();
}

/** La clé d'API du fournisseur d'envoi. */
export function resendApiKey(): string {
  return required("RESEND_API_KEY");
}

/**
 * L'origine publique de l'application (« https://app.clozado.fr »), pour
 * les adresses absolues composées HORS requête — un envoi repris par le
 * cron, un webhook, un lien de désinscription : `APP_URL` d'abord ; à
 * défaut, l'origine de la requête courante quand il y en a une ; sinon
 * l'adresse locale, pour les scripts.
 */
export async function publicOrigin(): Promise<string> {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (host) {
      const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
      return `${proto}://${host}`;
    }
  } catch {
    // Hors requête (cron, script) : pas d'en-têtes à lire.
  }
  return "http://localhost:3000";
}
