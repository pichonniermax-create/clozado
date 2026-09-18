import { addSuppression, getSuppression, recordEmailEvent, type EventType } from "@/db/queries/email-events";
import { getMessageByProviderId } from "@/db/queries/email-sends";
import { evaluateAutoPause, recordPlatformSuppression } from "@/db/queries/sending-health";
import type { ReceivedNotice } from "./inbound/ingest";

/**
 * LES WEBHOOKS DU FOURNISSEUR (docs/module-engagement.md §3.5) — signature
 * Svix vérifiée à la main (`svix.ts` : HMAC-SHA256 de `id.timestamp.corps`
 * avec le secret, horodatage à ±5 minutes, comparaison à temps constant),
 * puis traduits en événements de notre chronologie. Un webhook rejoué
 * s'arrête à l'unicité de son identifiant ; un message inconnu (le webhook
 * arrive avant que l'id du fournisseur soit écrit) est signalé pour que le
 * fournisseur réessaie.
 */

export { verifySvixSignature, verifySvixSignatureWithAny } from "./svix";

/** La charge d'un webhook Resend, dans ce qui nous concerne. */
export type ResendWebhookEvent = {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    created_at?: string;
    click?: { link?: string; timestamp?: string };
    bounce?: { type?: string; subType?: string; message?: string };
    failed?: { reason?: string };
    // `email.received` (Partie 2) : des métadonnées seulement — ni corps, ni en-têtes, ni pièces jointes.
    from?: string;
    to?: string[];
    cc?: string[];
    bcc?: string[];
    received_for?: string[];
    subject?: string;
    message_id?: string;
  };
};

export const RECEIVED_EVENT = "email.received";

/**
 * Ce que l'événement de RÉCEPTION porte, mis en forme pour l'ingestion
 * (§4.1) : le fournisseur n'envoie que des métadonnées, le contenu se relit
 * ensuite par son API. `received_for` est essentiel — c'est la seule trace
 * d'une adresse d'ingestion mise en Cci.
 */
export function receivedNoticeOf(event: ResendWebhookEvent): ReceivedNotice | null {
  const emailId = event.data?.email_id;
  if (!emailId) return null;
  return {
    emailId,
    from: event.data?.from ?? null,
    to: event.data?.to ?? [],
    cc: event.data?.cc ?? [],
    bcc: event.data?.bcc ?? [],
    receivedFor: event.data?.received_for ?? [],
    subject: event.data?.subject ?? null,
    messageId: event.data?.message_id ?? null,
    createdAt: event.data?.created_at ?? event.created_at ?? null,
  };
}

const EVENT_TYPES: Record<string, EventType> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delivery_delayed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.failed": "failed",
  "email.suppressed": "suppressed",
};

export type WebhookOutcome = "recorded" | "duplicate" | "ignored" | "unknown_message";

export async function handleResendEvent(event: ResendWebhookEvent, providerEventId: string): Promise<WebhookOutcome> {
  const type = EVENT_TYPES[event.type];
  const providerMessageId = event.data?.email_id;
  if (!type || !providerMessageId) return "ignored";
  const message = await getMessageByProviderId(providerMessageId);
  if (!message) return "unknown_message";

  // Un désinscrit n'est plus jamais suivi : ses ouvertures et ses clics ne sont pas enregistrés.
  if ((type === "opened" || type === "clicked") && (await getSuppression(message.organizationId, message.toEmail))) return "ignored";

  const occurredAt = new Date(event.data?.click?.timestamp ?? event.created_at ?? Date.now());
  const detail =
    type === "bounced"
      ? { type: event.data?.bounce?.type, subType: event.data?.bounce?.subType, message: event.data?.bounce?.message }
      : type === "failed"
        ? { reason: event.data?.failed?.reason }
        : null;
  const recorded = await recordEmailEvent({
    message,
    type,
    occurredAt: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
    url: type === "clicked" ? (event.data?.click?.link ?? null) : null,
    detail,
    providerEventId,
  });
  if (!recorded) return "duplicate";

  // Un rejet définitif ou une plainte : l'adresse ne recevra plus rien de cette organisation — ET, depuis les
  // garde-fous d'envoi, plus rien de TOUT le service : un rebond dur et une plainte parlent de l'adresse et de
  // la réputation commune, pas de la relation avec un cabinet. La liste de la plateforme ne garde qu'une
  // empreinte, jamais l'adresse.
  const hardBounce = type === "bounced" && /permanent/i.test(event.data?.bounce?.type ?? "");
  if (hardBounce) {
    await addSuppression({ organizationId: message.organizationId, email: message.toEmail, reason: "bounced", source: "webhook", messageId: message.id, contactId: message.contactId });
    await recordPlatformSuppression({ email: message.toEmail, reason: "bounced", detail: event.data?.bounce?.message ?? event.data?.bounce?.subType ?? null });
  }
  if (type === "complained") {
    await addSuppression({ organizationId: message.organizationId, email: message.toEmail, reason: "complained", source: "webhook", messageId: message.id, contactId: message.contactId });
    await recordPlatformSuppression({ email: message.toEmail, reason: "complained", detail: null });
  }
  // Au-dessus des seuils, l'envoi marketing de cette organisation s'arrête tout seul. Il ne repart jamais seul :
  // reprendre est une décision humaine, après nettoyage.
  if (hardBounce || type === "complained") await evaluateAutoPause(message.organizationId);
  return "recorded";
}
