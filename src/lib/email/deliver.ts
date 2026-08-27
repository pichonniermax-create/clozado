import type { EmailMessage } from "@/db/schema";
import { BATCH_MAX, ResendError, sendBatch, sendEmail, type OutgoingEmail } from "./resend";

/**
 * LA REMISE AU FOURNISSEUR d'un lot de messages déjà écrits en base
 * (docs/module-engagement.md §3.3) : le rendu est UN pour tout l'envoi, le
 * lien de désinscription est PAR message — il est substitué ici, au
 * dernier moment, jamais rendu cinq mille fois. Chaque message part avec
 * sa clé d'idempotence (son id) : un lot rejoué après une coupure ne
 * duplique rien.
 */

/** Le marqueur laissé dans le rendu à la place du lien de désinscription, propre à chaque message. */
export const UNSUBSCRIBE_PLACEHOLDER = "%%CLOZADO_UNSUBSCRIBE%%";

export type SendContent = { html: string; text: string };

/** Les adresses de désinscription d'un message : la page (dans le pied de page) et la route en un clic (en-tête `List-Unsubscribe`). */
export function unsubscribeUrls(origin: string, messageId: string): { page: string; oneClick: string } {
  return { page: `${origin}/desinscription/${messageId}`, oneClick: `${origin}/api/unsubscribe/${messageId}` };
}

export function buildOutgoing(message: EmailMessage, content: SendContent, origin: string): OutgoingEmail {
  const urls = unsubscribeUrls(origin, message.id);
  return {
    from: message.fromEmail,
    to: [message.toEmail],
    subject: message.subject,
    html: content.html.split(UNSUBSCRIBE_PLACEHOLDER).join(urls.page),
    text: content.text.split(UNSUBSCRIBE_PLACEHOLDER).join(urls.page),
    ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    headers: {
      "List-Unsubscribe": `<${urls.oneClick}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    tags: [
      { name: "message_id", value: message.id },
      { name: "kind", value: message.kind },
    ],
  };
}

export type DeliveryOutcome =
  | { status: "sent"; results: { id: string; providerMessageId: string }[] }
  /** Le fournisseur refuse ce lot (adresses invalides, charge) : ces messages sont en échec, l'envoi continue. */
  | { status: "rejected"; reason: string }
  /** Un quota du plan est atteint : rien ne partira avant qu'il se libère. */
  | { status: "quota"; code: string }
  /** Trop vite : réessayer après ce délai. */
  | { status: "rate_limited"; retryAfterSeconds: number }
  /** Le fournisseur ne répond pas (5xx, réseau) : réessayer plus tard. */
  | { status: "unavailable"; reason: string };

function keyFor(messages: EmailMessage[]): string {
  return messages.length === 1 ? `msg/${messages[0].id}` : `batch/${messages[0].sendId ?? "none"}/${messages[0].id}`;
}

/** Remet un lot (≤ 100) : en lot d'abord ; si la clé d'idempotence du lot ne correspond plus (reprise après un lot partiel), message par message. */
export async function deliverMessages(messages: EmailMessage[], content: SendContent, origin: string): Promise<DeliveryOutcome> {
  if (messages.length === 0) return { status: "sent", results: [] };
  // eslint-disable-next-line local/no-visible-text -- invariant de programmation, jamais affiché à une personne
  if (messages.length > BATCH_MAX) throw new Error(`deliver: un lot ne dépasse pas ${BATCH_MAX} messages`);
  const emails = messages.map((m) => buildOutgoing(m, content, origin));
  try {
    if (messages.length === 1) {
      const { id } = await sendEmail(emails[0], keyFor(messages));
      return { status: "sent", results: [{ id: messages[0].id, providerMessageId: id }] };
    }
    const ids = await sendBatch(emails, keyFor(messages));
    return { status: "sent", results: messages.map((m, i) => ({ id: m.id, providerMessageId: ids[i]?.id ?? "" })).filter((r) => r.providerMessageId) };
  } catch (error) {
    if (!(error instanceof ResendError)) return { status: "unavailable", reason: error instanceof Error ? error.message : String(error) };
    if (error.quotaExceeded) return { status: "quota", code: error.code ?? "quota_exceeded" };
    if (error.rateLimited) return { status: "rate_limited", retryAfterSeconds: error.retryAfterSeconds ?? 2 };
    if (error.code === "invalid_idempotent_request" || error.code === "concurrent_idempotent_requests") {
      return deliverOneByOne(messages, content, origin);
    }
    if (error.status >= 500) return { status: "unavailable", reason: error.message };
    return { status: "rejected", reason: error.message };
  }
}

/** Le repli message par message : chaque message garde sa propre clé, le résultat de chacun est connu. */
async function deliverOneByOne(messages: EmailMessage[], content: SendContent, origin: string): Promise<DeliveryOutcome> {
  const results: { id: string; providerMessageId: string }[] = [];
  for (const message of messages) {
    const outcome = await deliverMessages([message], content, origin);
    if (outcome.status === "sent") results.push(...outcome.results);
    else if (outcome.status === "rejected") continue;
    else return results.length > 0 ? { status: "sent", results } : outcome;
  }
  return { status: "sent", results };
}
