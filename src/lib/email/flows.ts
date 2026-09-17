/* eslint-disable local/no-visible-text -- des messages de journal lus par l'exploitant dans le journal du serveur, jamais par une personne à l'écran */
import { log } from "@/lib/log";
import { optional, required } from "./env";

/**
 * LES DEUX FLUX D'ENVOI (audit newsletter du 2026-09-17, §B.8) — séparés
 * pour qu'un incident sur les newsletters d'un cabinet ne bloque jamais la
 * connexion au produit :
 *
 * - **transactionnel** : les emails du PRODUIT — lien de connexion,
 *   invitation d'espace, notification à une personne, et la réception des
 *   emails d'ingestion. Compte Resend historique : `RESEND_API_KEY`,
 *   expéditeur `EMAIL_FROM`, domaine de réception `EMAIL_INBOUND_DOMAIN`.
 * - **marketing** : tout ce qui part AU NOM D'UNE ORGANISATION — newsletters,
 *   tests, brouillons et vagues des règles de relance — et les domaines
 *   d'expédition des organisations. Un SECOND compte Resend :
 *   `RESEND_MARKETING_API_KEY`, domaine mutualisé de repli
 *   `EMAIL_MARKETING_DOMAIN`, secret de webhook
 *   `RESEND_MARKETING_WEBHOOK_SECRET`.
 *
 * L'isolation vaut par le compte : les seuils de plaintes et de rebonds,
 * la liste de suppression et une éventuelle fermeture sont ceux du compte
 * marketing, jamais ceux du compte qui envoie les liens de connexion. Une
 * seconde clé sur le même compte n'isolerait rien.
 *
 * Tant que les variables marketing ne sont pas posées, le flux marketing
 * passe par le compte transactionnel, comme avant, et le journal le dit
 * une fois par processus : rien ne casse au déploiement.
 */
export type MailFlow = "transactional" | "marketing";

const warned = new Set<string>();
function warnOnce(key: string, message: string, fields: Record<string, string>): void {
  if (warned.has(key)) return;
  warned.add(key);
  log.warn(message, fields);
}

/** Pour les tests seulement : les avertissements « une fois » repartent de zéro. */
export function resetFlowWarningsForTests(): void {
  warned.clear();
}

/** Le flux marketing a-t-il son propre compte (clé posée) ? */
export function marketingFlowConfigured(): boolean {
  return optional("RESEND_MARKETING_API_KEY") !== null;
}

/** La clé du compte transactionnel (liens de connexion, invitations, notifications, réception). */
export function transactionalApiKey(): string {
  return required("RESEND_API_KEY");
}

/** La clé du compte marketing ; à défaut, celle du compte transactionnel — avec un avertissement, une fois. */
export function marketingApiKey(): string {
  const own = optional("RESEND_MARKETING_API_KEY");
  if (own) return own;
  warnOnce("marketing_key", "email_marketing_flow_not_isolated", {
    variable: "RESEND_MARKETING_API_KEY",
    effect: "les newsletters et les relances partent par le compte transactionnel (celui des liens de connexion) : aucune isolation de réputation",
  });
  return transactionalApiKey();
}

export function apiKeyFor(flow: MailFlow): string {
  return flow === "marketing" ? marketingApiKey() : transactionalApiKey();
}

/**
 * Le domaine mutualisé du flux marketing — l'expéditeur de repli
 * (`<slug>@…`) de toute organisation sans domaine vérifié. À défaut,
 * `EMAIL_SHARED_DOMAIN` (le domaine historique) ; si la clé marketing est
 * posée sans son domaine, l'incohérence est journalisée une fois : le
 * domaine de repli doit être vérifié dans le compte qui envoie.
 */
export function marketingSendingDomain(): string {
  const own = optional("EMAIL_MARKETING_DOMAIN")?.toLowerCase() ?? null;
  if (own) return own;
  if (marketingFlowConfigured()) {
    warnOnce("marketing_domain", "email_marketing_domain_missing", {
      variable: "EMAIL_MARKETING_DOMAIN",
      effect: "le repli utilise EMAIL_SHARED_DOMAIN, qui doit être vérifié dans le compte marketing",
    });
  }
  return required("EMAIL_SHARED_DOMAIN").toLowerCase();
}

/** Les secrets de webhook acceptés : celui du compte transactionnel et, s'il existe, celui du compte marketing. */
export function webhookSecrets(): string[] {
  return [optional("RESEND_WEBHOOK_SECRET"), optional("RESEND_MARKETING_WEBHOOK_SECRET")].filter((s): s is string => Boolean(s));
}
