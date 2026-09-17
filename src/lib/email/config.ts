import { headers } from "next/headers";
import { required } from "./env";

export { EmailConfigError } from "./env";
export { apiKeyFor, marketingApiKey, marketingFlowConfigured, marketingSendingDomain, transactionalApiKey, webhookSecrets, type MailFlow } from "./flows";

/**
 * La configuration de l'envoi (chantier engagement, docs/module-engagement.md
 * §2 et §7) — rien n'est en dur : les domaines de la plateforme et
 * l'expéditeur du produit viennent des variables d'environnement, et une
 * variable absente est une erreur dite en clair, jamais un repli silencieux
 * (« plus jamais onboarding@resend.dev »).
 */

/** L'expéditeur des emails du PRODUIT (lien de connexion, notifications à une personne) : « Clozado <connexion@mail.clozado.fr> ». */
export function productMailbox(): string {
  return required("EMAIL_FROM");
}

/**
 * Le sous-domaine mutualisé HISTORIQUE (`mail.clozado.fr`) — celui du
 * compte transactionnel. Le repli des envois au nom d'une organisation est
 * `marketingSendingDomain()` (flows.ts), qui retombe sur celui-ci tant que
 * le flux marketing n'a pas son domaine.
 */
export function sharedSendingDomain(): string {
  return required("EMAIL_SHARED_DOMAIN").toLowerCase();
}

/** Le domaine de réception des adresses d'ingestion (Partie 2). */
export function inboundDomain(): string {
  return required("EMAIL_INBOUND_DOMAIN").toLowerCase();
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
