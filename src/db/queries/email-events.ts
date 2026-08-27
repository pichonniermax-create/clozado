import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts, emailEvents, emailMessages, emailSuppressions } from "@/db/schema";
import type { EmailMessage, EmailSuppression } from "@/db/schema";

/**
 * LA CHRONOLOGIE des emails et LES ADRESSES SUPPRIMÉES (docs/module-engagement.md
 * §3.5). Un événement du fournisseur est enregistré une fois (l'identifiant
 * du webhook est unique : un rejeu ne compte pas deux fois) et met le
 * message à jour ; une désinscription est écrite dans `email_suppressions`
 * — et n'en sort jamais (déclencheur en base).
 */

export type EventType = "sent" | "delivered" | "delivery_delayed" | "bounced" | "complained" | "opened" | "clicked" | "failed" | "suppressed" | "unsubscribed";

export type RecordEventInput = {
  message: Pick<EmailMessage, "id" | "organizationId" | "toEmail">;
  type: EventType;
  occurredAt: Date;
  url?: string | null;
  /** Le motif d'un rejet, d'un retard, d'un échec — jamais l'adresse IP ni le navigateur. */
  detail?: Record<string, unknown> | null;
  /** L'identifiant du webhook (`svix-id`) ; null pour nos propres gestes. */
  providerEventId?: string | null;
};

/**
 * Enregistre l'événement puis met le message à jour — deux ordres,
 * idempotents : le second n'a lieu que si le premier a inséré (un webhook
 * rejoué s'arrête au premier). Rend vrai si l'événement était nouveau.
 */
export async function recordEmailEvent(input: RecordEventInput): Promise<boolean> {
  const inserted = await db.execute(sql`
    INSERT INTO ${emailEvents} (organization_id, message_id, type, occurred_at, url, detail, provider_event_id)
    VALUES (${input.message.organizationId}::uuid, ${input.message.id}::uuid, ${input.type}, ${input.occurredAt}, ${input.url ?? null}, ${input.detail ? JSON.stringify(input.detail) : null}::jsonb, ${input.providerEventId ?? null})
    ON CONFLICT (provider_event_id) WHERE provider_event_id IS NOT NULL DO NOTHING
    RETURNING id`);
  if (inserted.rows.length === 0) return false;
  await applyEventToMessage(input);
  return true;
}

/** Ce que chaque événement change sur le message : les statuts vont de l'avant, jamais en arrière (un « remis » n'efface pas un « ouvert »). */
async function applyEventToMessage(input: RecordEventInput): Promise<void> {
  const id = input.message.id;
  const at = input.occurredAt;
  switch (input.type) {
    case "sent":
      await db.execute(sql`UPDATE ${emailMessages} SET sent_at = COALESCE(sent_at, ${at}), status = CASE WHEN status = 'queued' THEN 'sent' ELSE status END, updated_at = now() WHERE id = ${id}::uuid`);
      return;
    case "delivered":
      await db.execute(sql`UPDATE ${emailMessages} SET delivered_at = COALESCE(delivered_at, ${at}), status = CASE WHEN status IN ('queued', 'sent', 'delayed') THEN 'delivered' ELSE status END, updated_at = now() WHERE id = ${id}::uuid`);
      return;
    case "delivery_delayed":
      await db.execute(sql`UPDATE ${emailMessages} SET status = CASE WHEN status IN ('queued', 'sent') THEN 'delayed' ELSE status END, updated_at = now() WHERE id = ${id}::uuid`);
      return;
    case "opened":
      await db.execute(sql`UPDATE ${emailMessages} SET first_opened_at = COALESCE(first_opened_at, ${at}), last_opened_at = GREATEST(COALESCE(last_opened_at, ${at}), ${at}), open_count = open_count + 1, updated_at = now() WHERE id = ${id}::uuid`);
      return;
    case "clicked":
      await db.execute(sql`UPDATE ${emailMessages} SET first_clicked_at = COALESCE(first_clicked_at, ${at}), last_clicked_at = GREATEST(COALESCE(last_clicked_at, ${at}), ${at}), click_count = click_count + 1, updated_at = now() WHERE id = ${id}::uuid`);
      return;
    case "bounced":
      await db.execute(sql`UPDATE ${emailMessages} SET status = 'bounced', bounced_at = COALESCE(bounced_at, ${at}), failure_reason = COALESCE(failure_reason, ${detailText(input.detail)}), updated_at = now() WHERE id = ${id}::uuid`);
      return;
    case "complained":
      await db.execute(sql`UPDATE ${emailMessages} SET status = 'complained', updated_at = now() WHERE id = ${id}::uuid`);
      return;
    case "failed":
    case "suppressed":
      await db.execute(sql`UPDATE ${emailMessages} SET status = 'failed', failed_at = COALESCE(failed_at, ${at}), failure_reason = COALESCE(failure_reason, ${detailText(input.detail)}), updated_at = now() WHERE id = ${id}::uuid`);
      return;
    case "unsubscribed":
      return;
  }
}

function detailText(detail: Record<string, unknown> | null | undefined): string | null {
  if (!detail) return null;
  const parts = ["type", "subType", "reason", "message"].map((k) => detail[k]).filter((v): v is string => typeof v === "string" && v.length > 0);
  return parts.length > 0 ? parts.join(" — ").slice(0, 500) : null;
}

// ---------------------------------------------------------------------------
// Les adresses supprimées
// ---------------------------------------------------------------------------

export type SuppressionReason = "unsubscribed" | "bounced" | "complained" | "manual";
export type SuppressionSource = "link" | "one_click" | "webhook" | "manual";

/**
 * Ajoute une adresse à la liste des suppressions de l'organisation ; une
 * adresse déjà présente reste telle quelle (le premier motif fait foi, et
 * une désinscription ne se réécrit jamais). Rend vrai si la ligne est
 * nouvelle.
 */
export async function addSuppression(input: {
  organizationId: string;
  email: string;
  reason: SuppressionReason;
  source: SuppressionSource;
  messageId?: string | null;
  contactId?: string | null;
}): Promise<boolean> {
  const result = await db.execute(sql`
    INSERT INTO ${emailSuppressions} (organization_id, email, reason, source, message_id, contact_id)
    VALUES (${input.organizationId}::uuid, ${input.email.trim().toLowerCase()}, ${input.reason}, ${input.source}, ${input.messageId ?? null}::uuid, ${input.contactId ?? null}::uuid)
    ON CONFLICT (organization_id, email) DO NOTHING
    RETURNING email`);
  return result.rows.length > 0;
}

export async function getSuppression(organizationId: string, email: string): Promise<EmailSuppression | null> {
  const rows = await db
    .select()
    .from(emailSuppressions)
    .where(and(eq(emailSuppressions.organizationId, organizationId), eq(emailSuppressions.email, email.trim().toLowerCase())))
    .limit(1);
  return rows[0] ?? null;
}

/** L'adresse d'un contact est-elle supprimée ? (la fiche le dit, les envois l'excluent). */
export async function suppressionOfContact(organizationId: string, contactId: string): Promise<EmailSuppression | null> {
  const rows = await db
    .select({ s: emailSuppressions })
    .from(contacts)
    .innerJoin(emailSuppressions, and(eq(emailSuppressions.organizationId, contacts.organizationId), sql`${emailSuppressions.email} = lower(${contacts.email})`))
    .where(and(eq(contacts.id, contactId), eq(contacts.organizationId, organizationId)))
    .limit(1);
  return rows[0]?.s ?? null;
}
