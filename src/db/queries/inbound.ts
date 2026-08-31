import { and, count, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts, inboundEmails, inboundRejections, organizations, users } from "@/db/schema";
import type { InboundEmail } from "@/db/schema";
import { assertOrgAccess, orgScope } from "@/db/scope";
import { AppError } from "@/lib/errors";
import type { OrgScopeUser } from "@/lib/session";

/**
 * LES EMAILS REÇUS sur l'adresse d'ingestion (docs/module-engagement.md §4)
 * — deux moitiés bien séparées :
 *
 * - **l'ingestion** (webhook, sans personne connectée) : résoudre le jeton
 *   d'adresse, compter le débit, écrire ce qui arrive, y compris les REFUS
 *   — un refus est une ligne visible par l'organisation, jamais un silence ;
 * - **les écrans** (une personne, son organisation) : lister, ouvrir,
 *   confirmer, ignorer — tout passe par `orgScope`/`assertOrgAccess`.
 *
 * Un email refusé faute d'organisation (jeton inconnu) n'appartient à
 * personne : il n'est qu'un COMPTEUR dans `inbound_rejections`, pour qu'une
 * attaque ne remplisse pas la table.
 */

export type InboundStatus = "pending" | "confirmed" | "ignored" | "rejected";

/** Les motifs de refus, en codes — traduits à l'écran (`emails_recus.rejection.<code>`). */
export type RejectionReason = "unknown_address" | "sender_not_member" | "sender_not_authenticated" | "rate_limited" | "too_large" | "unreadable";

// ---------------------------------------------------------------------------
// L'ingestion — appelée par le webhook, sans personne connectée
// ---------------------------------------------------------------------------

export type IngestOrganization = {
  id: string;
  name: string;
  storeInboundBodies: boolean;
  /** La langue de l'organisation — celle dans laquelle la proposition est demandée au modèle. */
  defaultLocale: string;
};

/** L'organisation d'une adresse d'ingestion. Le jeton EST le secret : inconnu, on ne lit rien d'autre. */
export async function findOrganizationByIngestToken(token: string): Promise<IngestOrganization | null> {
  const normalized = token.trim().toLowerCase();
  if (!normalized) return null;
  const rows = await db
    .select({ id: organizations.id, name: organizations.name, storeInboundBodies: organizations.storeInboundBodies, defaultLocale: organizations.defaultLocale })
    .from(organizations)
    .where(eq(organizations.ingestToken, normalized))
    .limit(1);
  return rows[0] ?? null;
}

/** Les adresses des membres de l'organisation, en minuscules — la deuxième couche du §4.2. */
export async function listMemberEmails(organizationId: string): Promise<string[]> {
  const rows = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.organizationId, organizationId));
  return rows.map((r) => (r.email ?? "").trim().toLowerCase()).filter(Boolean);
}

/** L'utilisateur d'une adresse dans cette organisation (l'expéditeur, quand c'en est un). */
export async function findMemberByEmail(organizationId: string, email: string): Promise<{ id: string; email: string } | null> {
  const rows = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(and(eq(users.organizationId, organizationId), sql`lower(${users.email}) = ${email.trim().toLowerCase()}`))
    .limit(1);
  const row = rows[0];
  return row?.email ? { id: row.id, email: row.email } : null;
}

/** Combien d'emails cette organisation a reçus depuis `since` — refus compris : le débit compte tout ce qui arrive. */
export async function countInboundSince(organizationId: string, since: Date): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(inboundEmails)
    .where(and(eq(inboundEmails.organizationId, organizationId), gte(inboundEmails.receivedAt, since)));
  return rows[0]?.n ?? 0;
}

/** Un même `Message-ID` déjà ingéré par cette organisation (un transfert renvoyé deux fois). */
export async function inboundExistsByMessageId(organizationId: string, messageIdHeader: string): Promise<boolean> {
  const rows = await db
    .select({ id: inboundEmails.id })
    .from(inboundEmails)
    .where(and(eq(inboundEmails.organizationId, organizationId), eq(inboundEmails.messageIdHeader, messageIdHeader)))
    .limit(1);
  return rows.length > 0;
}

export type InsertInboundInput = {
  organizationId: string;
  providerEmailId: string;
  messageIdHeader: string | null;
  receivedAt: Date;
  senderEmail: string;
  senderUserId: string | null;
  authResult: "dkim_aligned" | "spf_aligned" | "failed" | "unavailable";
  authDetail: unknown;
  status: InboundStatus;
  rejectionReason: RejectionReason | null;
  mode: "forward" | "copy" | null;
  subject: string | null;
  counterpartEmail: string | null;
  counterpartName: string | null;
  originalDate: Date | null;
  proposal: unknown;
  /** Le corps : NULL dès la réception quand l'organisation ne l'a pas demandé — pas seulement caché. */
  bodyText: string | null;
  sizeBytes: number | null;
};

/**
 * Écrit l'email reçu. Le même identifiant de fournisseur ne s'écrit
 * qu'une fois (index unique) : un webhook rejoué rend null, et l'appelant
 * sait qu'il n'a rien à refaire.
 */
export async function insertInboundEmail(input: InsertInboundInput): Promise<InboundEmail | null> {
  const [row] = await db
    .insert(inboundEmails)
    .values({
      organizationId: input.organizationId,
      providerEmailId: input.providerEmailId,
      messageIdHeader: input.messageIdHeader,
      receivedAt: input.receivedAt,
      senderEmail: input.senderEmail.trim().toLowerCase(),
      senderUserId: input.senderUserId,
      authResult: input.authResult,
      authDetail: input.authDetail ?? null,
      status: input.status,
      rejectionReason: input.rejectionReason,
      mode: input.mode,
      subject: input.subject,
      counterpartEmail: input.counterpartEmail,
      counterpartName: input.counterpartName,
      originalDate: input.originalDate,
      proposal: input.proposal ?? null,
      bodyText: input.bodyText,
      sizeBytes: input.sizeBytes,
    })
    .onConflictDoNothing({ target: inboundEmails.providerEmailId })
    .returning();
  return row ?? null;
}

/**
 * Un refus SANS organisation (jeton inconnu) : un compteur par (motif,
 * début de l'adresse visée), jamais une ligne par email — une adresse
 * pilonnée n'écrit pas une table entière.
 */
export async function recordInboundRejection(reason: RejectionReason, detail: string): Promise<void> {
  await db
    .insert(inboundRejections)
    .values({ reason, detail })
    .onConflictDoUpdate({
      target: [inboundRejections.reason, inboundRejections.detail],
      set: { count: sql`${inboundRejections.count} + 1`, lastSeenAt: new Date() },
    });
}

// ---------------------------------------------------------------------------
// Les écrans — une personne, son organisation
// ---------------------------------------------------------------------------

export const INBOUND_PAGE_SIZE = 25;

/** Les trois onglets de `/emails-recus` : à confirmer, traités (confirmés ou ignorés), refusés. */
export type InboundTab = "pending" | "treated" | "rejected";

const TAB_STATUSES: Record<InboundTab, InboundStatus[]> = {
  pending: ["pending"],
  treated: ["confirmed", "ignored"],
  rejected: ["rejected"],
};

export function isInboundTab(value: string | undefined): value is InboundTab {
  return value === "pending" || value === "treated" || value === "rejected";
}

export async function countInboundByTab(user: OrgScopeUser): Promise<Record<InboundTab, number>> {
  const rows = await db
    .select({ status: inboundEmails.status, n: count() })
    .from(inboundEmails)
    .where(orgScope(user, inboundEmails.organizationId))
    .groupBy(inboundEmails.status);
  const byStatus = new Map(rows.map((r) => [r.status, r.n]));
  const sum = (statuses: InboundStatus[]) => statuses.reduce((total, s) => total + (byStatus.get(s) ?? 0), 0);
  return { pending: sum(TAB_STATUSES.pending), treated: sum(TAB_STATUSES.treated), rejected: sum(TAB_STATUSES.rejected) };
}

export type InboundListRow = InboundEmail & { contactName: string | null };

export async function listInboundEmails(user: OrgScopeUser, tab: InboundTab, page: number): Promise<InboundListRow[]> {
  const scope = orgScope(user, inboundEmails.organizationId);
  const conditions = [inArray(inboundEmails.status, TAB_STATUSES[tab])];
  if (scope) conditions.push(scope);
  return db
    .select({ ...getInboundColumns(), contactName: contacts.name })
    .from(inboundEmails)
    .leftJoin(contacts, eq(contacts.id, inboundEmails.contactId))
    .where(and(...conditions))
    .orderBy(desc(inboundEmails.receivedAt))
    .limit(INBOUND_PAGE_SIZE)
    .offset(Math.max(0, page - 1) * INBOUND_PAGE_SIZE);
}

/** Toutes les colonnes de la table — nommées ici pour pouvoir joindre le nom du contact sans perdre le type. */
function getInboundColumns() {
  return {
    id: inboundEmails.id,
    organizationId: inboundEmails.organizationId,
    providerEmailId: inboundEmails.providerEmailId,
    messageIdHeader: inboundEmails.messageIdHeader,
    receivedAt: inboundEmails.receivedAt,
    senderEmail: inboundEmails.senderEmail,
    senderUserId: inboundEmails.senderUserId,
    authResult: inboundEmails.authResult,
    authDetail: inboundEmails.authDetail,
    status: inboundEmails.status,
    rejectionReason: inboundEmails.rejectionReason,
    mode: inboundEmails.mode,
    subject: inboundEmails.subject,
    counterpartEmail: inboundEmails.counterpartEmail,
    counterpartName: inboundEmails.counterpartName,
    originalDate: inboundEmails.originalDate,
    contactId: inboundEmails.contactId,
    activityId: inboundEmails.activityId,
    proposal: inboundEmails.proposal,
    bodyText: inboundEmails.bodyText,
    sizeBytes: inboundEmails.sizeBytes,
    confirmedBy: inboundEmails.confirmedBy,
    confirmedAt: inboundEmails.confirmedAt,
    createdAt: inboundEmails.createdAt,
  };
}

export async function getInboundEmail(user: OrgScopeUser, id: string): Promise<InboundEmail> {
  const row = await db.query.inboundEmails.findFirst({ where: eq(inboundEmails.id, id) });
  if (!row) throw new AppError("cet_email_recu_est_introuvable", undefined, 404);
  assertOrgAccess(user, row.organizationId);
  return row;
}

/** Les fiches candidates pour la contrepartie : par adresse (signal fort), puis par nom (signal faible). */
export async function findContactCandidates(user: OrgScopeUser, input: { email: string | null; name: string | null }): Promise<{ id: string; name: string; email: string | null }[]> {
  if (!user.organizationId) return [];
  const signals = [];
  if (input.email?.trim()) signals.push(sql`lower(${contacts.email}) = ${input.email.trim().toLowerCase()}`);
  if (input.name?.trim()) signals.push(sql`lower(${contacts.name}) = ${input.name.trim().toLowerCase()}`);
  if (signals.length === 0) return [];
  return db
    .select({ id: contacts.id, name: contacts.name, email: contacts.email })
    .from(contacts)
    .where(and(eq(contacts.organizationId, user.organizationId), isNull(contacts.deletedAt), sql`(${sql.join(signals, sql` OR `)})`))
    .limit(5);
}

/** Le sort d'un email traité : le contact et l'interaction posés, par qui et quand. */
export async function markInboundConfirmed(user: OrgScopeUser, id: string, input: { contactId: string; activityId: string; confirmedBy: string }): Promise<void> {
  const row = await getInboundEmail(user, id);
  await db
    .update(inboundEmails)
    .set({ status: "confirmed", contactId: input.contactId, activityId: input.activityId, confirmedBy: input.confirmedBy, confirmedAt: new Date() })
    .where(eq(inboundEmails.id, row.id));
}

export async function markInboundIgnored(user: OrgScopeUser, id: string, confirmedBy: string): Promise<void> {
  const row = await getInboundEmail(user, id);
  if (row.status === "confirmed") throw new AppError("cet_email_a_deja_ete_confirme");
  await db.update(inboundEmails).set({ status: "ignored", confirmedBy, confirmedAt: new Date() }).where(eq(inboundEmails.id, row.id));
}

/** L'arrêt de l'envoi automatique quand un contact a RÉPONDU (§4.3) — jamais réarmé par l'ingestion. */
export async function stopAutoSendOnReply(organizationId: string, contactId: string): Promise<void> {
  await db
    .update(contacts)
    .set({ autoSendStoppedAt: new Date(), autoSendStopReason: "replied" })
    .where(and(eq(contacts.id, contactId), eq(contacts.organizationId, organizationId), isNull(contacts.autoSendStoppedAt)));
}
