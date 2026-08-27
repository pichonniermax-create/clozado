import { createHmac, timingSafeEqual } from "node:crypto";
import { addSuppression, getSuppression, recordEmailEvent, type EventType } from "@/db/queries/email-events";
import { getMessageByProviderId } from "@/db/queries/email-sends";

/**
 * LES WEBHOOKS DU FOURNISSEUR (docs/module-engagement.md §3.5) — vérifiés
 * à la main (signature Svix : HMAC-SHA256 de `id.timestamp.corps` avec le
 * secret, horodatage à ±5 minutes, comparaison à temps constant), puis
 * traduits en événements de notre chronologie. Un webhook rejoué s'arrête
 * à l'unicité de son identifiant ; un message inconnu (le webhook arrive
 * avant que l'id du fournisseur soit écrit) est signalé pour que le
 * fournisseur réessaie.
 */

const TOLERANCE_SECONDS = 5 * 60;

export function verifySvixSignature(headers: { id: string | null; timestamp: string | null; signature: string | null }, body: string, secret: string): boolean {
  if (!headers.id || !headers.timestamp || !headers.signature) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) return false;
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const expected = createHmac("sha256", key).update(`${headers.id}.${headers.timestamp}.${body}`).digest();
  // L'en-tête peut porter plusieurs signatures (« v1,… v1,… ») : une seule doit correspondre.
  for (const part of headers.signature.split(" ")) {
    const [version, value] = part.split(",", 2);
    if (version !== "v1" || !value) continue;
    const candidate = Buffer.from(value, "base64");
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) return true;
  }
  return false;
}

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
  };
};

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

  // Un rejet définitif ou une plainte : l'adresse ne recevra plus rien de cette organisation.
  if (type === "bounced" && /permanent/i.test(event.data?.bounce?.type ?? "")) {
    await addSuppression({ organizationId: message.organizationId, email: message.toEmail, reason: "bounced", source: "webhook", messageId: message.id, contactId: message.contactId });
  }
  if (type === "complained") {
    await addSuppression({ organizationId: message.organizationId, email: message.toEmail, reason: "complained", source: "webhook", messageId: message.id, contactId: message.contactId });
  }
  return "recorded";
}
