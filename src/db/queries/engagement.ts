import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { activities, appointments, emailEvents, emailMessages, newsletters } from "@/db/schema";
import { assertOrgAccess } from "@/db/scope";
import type { OrgScopeUser } from "@/lib/session";
import { getContact } from "./contacts";

/**
 * LES INDICATEURS D'ENGAGEMENT D'UN CONTACT — une seule définition par
 * indicateur (docs/module-engagement.md §3.6, précisée le 2026-08-27),
 * écrite en SQL ici et lue par la fiche, par les règles (Partie 3) et par
 * les critères de segment :
 *
 * - dernier email ouvert : `max(last_opened_at)` des emails reçus
 *   (newsletter, manuel, automatique — jamais un test) ;
 * - dernier clic : `max(last_clicked_at)` ;
 * - dernière interaction : le plus récent d'une activité consignée (tout
 *   type), d'un rendez-vous TENU (non annulé, déjà passé) et d'un CLIC —
 *   le clic est un signal fort ; l'ouverture, approximative, n'en est pas
 *   un : un contact qui « ouvre » sans cliquer n'est pas un contact actif ;
 * - dernier rendez-vous : `max(starts_at)` des rendez-vous non annulés, à
 *   venir compris.
 */
export type ContactIndicators = {
  lastOpenedAt: Date | null;
  lastClickedAt: Date | null;
  lastInteractionAt: Date | null;
  lastAppointmentAt: Date | null;
};

const RECEIVED_KINDS = ["newsletter", "manual", "automatic"] as const;

/** Les fragments SQL, paramétrés par les colonnes du contact courant — pour une jointure dans une autre requête (règles, segments). */
export function indicatorSql(contactId: unknown, organizationId: unknown) {
  const received = sql`${emailMessages}.contact_id = ${contactId} AND ${emailMessages}.organization_id = ${organizationId} AND ${emailMessages}.kind IN ('newsletter', 'manual', 'automatic')`;
  const lastOpened = sql`(SELECT max(${emailMessages.lastOpenedAt}) FROM ${emailMessages} WHERE ${received})`;
  const lastClicked = sql`(SELECT max(${emailMessages.lastClickedAt}) FROM ${emailMessages} WHERE ${received})`;
  const lastActivity = sql`(SELECT max(${activities.occurredAt}) FROM ${activities} WHERE ${activities.contactId} = ${contactId} AND ${activities.organizationId} = ${organizationId})`;
  const lastHeldAppointment = sql`(SELECT max(${appointments.startsAt}) FROM ${appointments} WHERE ${appointments.contactId} = ${contactId} AND ${appointments.organizationId} = ${organizationId} AND ${appointments.status} = 'scheduled' AND ${appointments.startsAt} <= now())`;
  const lastAppointment = sql`(SELECT max(${appointments.startsAt}) FROM ${appointments} WHERE ${appointments.contactId} = ${contactId} AND ${appointments.organizationId} = ${organizationId} AND ${appointments.status} = 'scheduled')`;
  return {
    lastOpened,
    lastClicked,
    lastInteraction: sql`GREATEST(${lastActivity}, ${lastHeldAppointment}, ${lastClicked})`,
    lastAppointment,
  };
}

export async function getContactIndicators(user: OrgScopeUser, contactId: string): Promise<ContactIndicators> {
  const contact = await getContact(user, contactId);
  const parts = indicatorSql(sql`${contactId}::uuid`, sql`${contact.organizationId}::uuid`);
  const result = await db.execute(sql`
    SELECT ${parts.lastOpened} AS last_opened, ${parts.lastClicked} AS last_clicked, ${parts.lastInteraction} AS last_interaction, ${parts.lastAppointment} AS last_appointment`);
  const row = result.rows[0] as Record<string, string | Date | null>;
  const at = (v: string | Date | null | undefined) => (v ? new Date(v) : null);
  return {
    lastOpenedAt: at(row.last_opened),
    lastClickedAt: at(row.last_clicked),
    lastInteractionAt: at(row.last_interaction),
    lastAppointmentAt: at(row.last_appointment),
  };
}

// ---------------------------------------------------------------------------
// Ce que le journal d'une fiche montre des emails
// ---------------------------------------------------------------------------

export type ContactEmailEntry = {
  messageId: string;
  newsletterId: string | null;
  kind: string;
  subject: string;
  status: string;
  sentAt: Date | null;
  firstOpenedAt: Date | null;
  bouncedAt: Date | null;
  failureReason: string | null;
  /** Les clics, chacun avec son lien, et la désinscription. */
  events: { type: string; at: Date; url: string | null }[];
};

/** Les emails reçus par un contact (jamais les tests — ils n'ont pas de contact), avec leurs clics : la matière du journal unifié. */
export async function listContactEmailEntries(organizationId: string, contactId: string, limit = 100): Promise<ContactEmailEntry[]> {
  const messages = await db
    .select({
      id: emailMessages.id,
      newsletterId: emailMessages.newsletterId,
      kind: emailMessages.kind,
      subject: emailMessages.subject,
      status: emailMessages.status,
      sentAt: emailMessages.sentAt,
      firstOpenedAt: emailMessages.firstOpenedAt,
      bouncedAt: emailMessages.bouncedAt,
      failureReason: emailMessages.failureReason,
    })
    .from(emailMessages)
    .where(and(eq(emailMessages.organizationId, organizationId), eq(emailMessages.contactId, contactId), inArray(emailMessages.kind, [...RECEIVED_KINDS])))
    .orderBy(desc(emailMessages.createdAt))
    .limit(limit);
  if (messages.length === 0) return [];
  const events = await db
    .select({ messageId: emailEvents.messageId, type: emailEvents.type, at: emailEvents.occurredAt, url: emailEvents.url })
    .from(emailEvents)
    .where(and(eq(emailEvents.organizationId, organizationId), inArray(emailEvents.messageId, messages.map((m) => m.id)), inArray(emailEvents.type, ["clicked", "unsubscribed"])))
    .orderBy(desc(emailEvents.occurredAt))
    .limit(limit * 3);
  const byMessage = new Map<string, ContactEmailEntry["events"]>();
  for (const e of events) {
    const list = byMessage.get(e.messageId) ?? [];
    list.push({ type: e.type, at: e.at, url: e.url });
    byMessage.set(e.messageId, list);
  }
  return messages.map((m) => ({ messageId: m.id, newsletterId: m.newsletterId, kind: m.kind, subject: m.subject, status: m.status, sentAt: m.sentAt, firstOpenedAt: m.firstOpenedAt, bouncedAt: m.bouncedAt, failureReason: m.failureReason, events: byMessage.get(m.id) ?? [] }));
}

/** Les newsletters reçues par un contact via un envoi RÉEL — la fiche les liste avec leur état. */
export async function listSentNewslettersOfContact(user: OrgScopeUser, contactId: string) {
  const contact = await getContact(user, contactId);
  assertOrgAccess(user, contact.organizationId);
  return db
    .select({ id: newsletters.id, subject: emailMessages.subject, status: emailMessages.status, sentAt: emailMessages.sentAt, firstOpenedAt: emailMessages.firstOpenedAt, firstClickedAt: emailMessages.firstClickedAt })
    .from(emailMessages)
    .innerJoin(newsletters, eq(emailMessages.newsletterId, newsletters.id))
    .where(and(eq(emailMessages.contactId, contactId), eq(emailMessages.kind, "newsletter")))
    .orderBy(desc(emailMessages.createdAt))
    .limit(50);
}
