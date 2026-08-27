import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { addSuppression, recordEmailEvent, type SuppressionSource } from "@/db/queries/email-events";
import { getMessageById } from "@/db/queries/email-sends";

/**
 * LA DÉSINSCRIPTION par le lien d'un email (docs/module-engagement.md §3.4) :
 * l'id du message (uuid v4, ni devinable ni énumérable) désigne l'adresse
 * et l'organisation ; l'adresse entre dans `email_suppressions` — et n'en
 * sortira jamais (déclencheur en base). Un email de TEST ne désinscrit
 * personne : la page le dit.
 */
export type UnsubscribeOutcome =
  | { kind: "invalid" }
  | { kind: "test"; organizationName: string; locale: string }
  | { kind: "done" | "already"; organizationName: string; email: string; locale: string };

export async function resolveUnsubscribe(messageId: string): Promise<UnsubscribeOutcome> {
  const message = await getMessageById(messageId);
  if (!message) return { kind: "invalid" };
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, message.organizationId) });
  if (!org) return { kind: "invalid" };
  if (message.kind === "test") return { kind: "test", organizationName: org.name, locale: org.defaultLocale };
  return { kind: "already", organizationName: org.name, email: message.toEmail, locale: org.defaultLocale };
}

/** Le geste lui-même — idempotent : une adresse déjà supprimée ne change pas, et le dit. */
export async function unsubscribeByMessage(messageId: string, source: SuppressionSource): Promise<UnsubscribeOutcome> {
  const message = await getMessageById(messageId);
  if (!message) return { kind: "invalid" };
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, message.organizationId) });
  if (!org) return { kind: "invalid" };
  if (message.kind === "test") return { kind: "test", organizationName: org.name, locale: org.defaultLocale };
  const added = await addSuppression({
    organizationId: message.organizationId,
    email: message.toEmail,
    reason: "unsubscribed",
    source,
    messageId: message.id,
    contactId: message.contactId,
  });
  if (added) {
    await recordEmailEvent({ message, type: "unsubscribed", occurredAt: new Date(), detail: { source } });
  }
  return { kind: added ? "done" : "already", organizationName: org.name, email: message.toEmail, locale: org.defaultLocale };
}
