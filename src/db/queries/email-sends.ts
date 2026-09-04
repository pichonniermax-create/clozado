import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { contacts, emailEvents, emailMessages, emailSuppressions, newsletterRecipients, newsletterSends, newsletters, users } from "@/db/schema";
import type { EmailMessage, NewsletterSend } from "@/db/schema";
import { AppError } from "@/lib/errors";
import type { OrgScopeUser } from "@/lib/session";
import { assertOrgAccess } from "@/db/scope";
import { memberCondition, type TargetLike } from "./mail-targets";

/**
 * L'ENVOI RÉEL d'une newsletter, côté base (docs/module-engagement.md §3.3) :
 * le départ en UN ordre SQL atomique, les requêtes de l'exécutant (bail,
 * lot suivant, résultats), la pause et la reprise, les agrégats de
 * campagne, l'email de test. Le driver HTTP n'a pas de transaction : ce
 * qui doit être atomique est un seul ordre (CTE modifiantes), et tout le
 * reste est idempotent.
 */

/** Le bail d'un exécutant : au-delà, un autre (le cron) peut reprendre l'envoi. */
export const SEND_LEASE_MINUTES = 5;

export type StartSendInput = {
  newsletterId: string;
  organizationId: string;
  target: TargetLike;
  /** La photographie de l'audience, sans le nombre (posé par la requête). */
  snapshot: object;
  topics: string[];
  startedBy: string;
  subject: string;
  html: string;
  textBody: string;
  from: string;
  replyTo: string;
};

function textArray(values: string[]) {
  if (values.length === 0) return sql`ARRAY[]::text[]`;
  return sql`ARRAY[${sql.join(values.map((v) => sql`${v}`), sql`, `)}]::text[]`;
}

/**
 * LE DÉPART, en un seul ordre : l'audience figée (les membres de la cible à
 * cet instant — l'existant de « marquer comme envoyée »), la newsletter
 * passée `sent`, la ligne d'envoi avec la photographie du rendu et un
 * premier bail, puis un message `queued` par destinataire QUI A UNE ADRESSE
 * et N'EST PAS SUPPRIMÉ (les autres restent des destinataires figés : le
 * compte reste juste, l'écran dit combien). Une newsletter déjà partie ne
 * repart pas : la garde `sent_at IS NULL` vide toutes les CTE et la requête
 * ne rend rien.
 */
export async function startNewsletterSend(input: StartSendInput): Promise<{ sendId: string; queued: number }> {
  const sendId = randomUUID();
  const result = await db.execute(sql`
    WITH fresh AS (
      SELECT 1 FROM ${newsletters} WHERE id = ${input.newsletterId}::uuid AND organization_id = ${input.organizationId}::uuid AND sent_at IS NULL
    ),
    recips AS (
      INSERT INTO ${newsletterRecipients} (organization_id, newsletter_id, contact_id)
      SELECT ${input.organizationId}::uuid, ${input.newsletterId}::uuid, ${contacts.id}
      FROM ${contacts}
      WHERE EXISTS (SELECT 1 FROM fresh) AND ${memberCondition(input.target)}
      ON CONFLICT DO NOTHING
      RETURNING contact_id
    ),
    frozen AS (
      UPDATE ${newsletters}
      SET sent_at = now(), sent_marked_by = ${input.startedBy}::uuid, send_mode = 'sent', topics = ${textArray(input.topics)},
          audience_snapshot = (${JSON.stringify(input.snapshot)}::jsonb || jsonb_build_object('count', (SELECT count(*) FROM recips))),
          updated_at = now()
      WHERE id = ${input.newsletterId}::uuid AND sent_at IS NULL
      RETURNING id
    ),
    send AS (
      INSERT INTO ${newsletterSends} (id, organization_id, newsletter_id, started_by, subject, html, text_body, lease_until)
      SELECT ${sendId}::uuid, ${input.organizationId}::uuid, frozen.id, ${input.startedBy}::uuid, ${input.subject}, ${input.html}, ${input.textBody},
             now() + make_interval(mins => ${SEND_LEASE_MINUTES})
      FROM frozen
      RETURNING id
    ),
    msgs AS (
      INSERT INTO ${emailMessages} (organization_id, kind, newsletter_id, send_id, contact_id, to_email, from_email, reply_to, subject, status, queued_at)
      SELECT ${input.organizationId}::uuid, 'newsletter', ${input.newsletterId}::uuid, send.id, c.id, lower(c.email), ${input.from}, ${input.replyTo}, ${input.subject}, 'queued', now()
      FROM send, recips r
      JOIN ${contacts} c ON c.id = r.contact_id
      WHERE c.email IS NOT NULL AND c.email <> '' AND c.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM ${emailSuppressions} s WHERE s.organization_id = ${input.organizationId}::uuid AND s.email = lower(c.email))
      RETURNING id
    )
    SELECT (SELECT count(*) FROM msgs)::int AS queued, EXISTS (SELECT 1 FROM send) AS started`);
  // La requête principale ne voit pas les lignes que ses CTE viennent d'écrire (règle des CTE modifiantes) :
  // elle lit leurs RETURNING, et le compteur de l'envoi s'écrit dans un second ordre — recompté de toute façon.
  const row = result.rows[0] as { queued?: number | string; started?: boolean } | undefined;
  if (!row?.started) throw new AppError("cette_newsletter_est_deja_marquee_envoyee");
  const queued = Number(row.queued ?? 0);
  await db.update(newsletterSends).set({ queued }).where(eq(newsletterSends.id, sendId));
  return { sendId, queued };
}

/** L'envoi ouvert d'une newsletter (au plus un, garanti par la base), ou le dernier terminé. */
export async function getLatestSend(newsletterId: string): Promise<NewsletterSend | null> {
  const rows = await db.select().from(newsletterSends).where(eq(newsletterSends.newsletterId, newsletterId)).orderBy(desc(newsletterSends.startedAt)).limit(1);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// L'exécutant
// ---------------------------------------------------------------------------

/**
 * Prend le bail d'un envoi ouvert : un seul exécutant à la fois (UPDATE
 * atomique sur un bail libre ou expiré, hors pause). Rend la ligne avec
 * son rendu, ou null si quelqu'un d'autre l'a, si l'envoi est en pause ou
 * s'il est fini.
 */
export async function claimSend(sendId: string): Promise<NewsletterSend | null> {
  const rows = await db
    .update(newsletterSends)
    .set({ leaseUntil: sql`now() + make_interval(mins => ${SEND_LEASE_MINUTES})` })
    .where(
      and(
        eq(newsletterSends.id, sendId),
        isNull(newsletterSends.finishedAt),
        sql`(${newsletterSends.leaseUntil} IS NULL OR ${newsletterSends.leaseUntil} < now())`,
        sql`(${newsletterSends.pausedUntil} IS NULL OR ${newsletterSends.pausedUntil} <= now())`
      )
    )
    .returning();
  return rows[0] ?? null;
}

/** Prolonge le bail d'un exécutant qui travaille encore (entre deux lots). */
export async function renewLease(sendId: string): Promise<void> {
  await db.update(newsletterSends).set({ leaseUntil: sql`now() + make_interval(mins => ${SEND_LEASE_MINUTES})` }).where(eq(newsletterSends.id, sendId));
}

export async function nextQueuedMessages(sendId: string, limit: number): Promise<EmailMessage[]> {
  return db
    .select()
    .from(emailMessages)
    .where(and(eq(emailMessages.sendId, sendId), eq(emailMessages.status, "queued")))
    .orderBy(emailMessages.createdAt)
    .limit(limit);
}

/** Les messages partis : leur identifiant chez le fournisseur, en un seul ordre. */
export async function markMessagesSent(results: { id: string; providerMessageId: string }[]): Promise<void> {
  if (results.length === 0) return;
  const values = sql.join(
    results.map((r) => sql`(${r.id}::uuid, ${r.providerMessageId})`),
    sql`, `
  );
  await db.execute(sql`
    UPDATE ${emailMessages} AS m
    SET status = 'sent', provider_message_id = v.pid, sent_at = now(), updated_at = now()
    FROM (VALUES ${values}) AS v(id, pid)
    WHERE m.id = v.id AND m.status = 'queued'`);
}

export async function markMessagesFailed(ids: string[], reason: string): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(emailMessages)
    .set({ status: "failed", failedAt: new Date(), failureReason: reason.slice(0, 500), updatedAt: new Date() })
    .where(and(inArray(emailMessages.id, ids), eq(emailMessages.status, "queued")));
}

/** Les compteurs de l'envoi, recomptés depuis ses messages (jamais incrémentés à l'aveugle). */
export async function refreshSendCounters(sendId: string): Promise<{ queued: number; sent: number; failed: number }> {
  const result = await db.execute(sql`
    UPDATE ${newsletterSends} s SET
      queued = (SELECT count(*) FROM ${emailMessages} m WHERE m.send_id = s.id AND m.status = 'queued'),
      sent = (SELECT count(*) FROM ${emailMessages} m WHERE m.send_id = s.id AND m.status NOT IN ('queued', 'failed', 'draft', 'canceled')),
      failed = (SELECT count(*) FROM ${emailMessages} m WHERE m.send_id = s.id AND m.status = 'failed')
    WHERE s.id = ${sendId}::uuid
    RETURNING queued, sent, failed`);
  const row = result.rows[0] as { queued: number | string; sent: number | string; failed: number | string };
  return { queued: Number(row.queued), sent: Number(row.sent), failed: Number(row.failed) };
}

export async function finishSend(sendId: string, error: string | null = null): Promise<void> {
  await db.update(newsletterSends).set({ finishedAt: new Date(), leaseUntil: null, pausedUntil: null, pauseReason: null, error }).where(eq(newsletterSends.id, sendId));
}

/** Met l'envoi en pause (quota du fournisseur, débit) : le bail est rendu, le cron reprendra après `until`. */
export async function pauseSend(sendId: string, until: Date, reason: string): Promise<void> {
  await db.update(newsletterSends).set({ pausedUntil: until, pauseReason: reason, leaseUntil: null }).where(eq(newsletterSends.id, sendId));
}

export async function releaseLease(sendId: string): Promise<void> {
  await db.update(newsletterSends).set({ leaseUntil: null }).where(eq(newsletterSends.id, sendId));
}

/** Les envois ouverts que le cron peut reprendre : bail libre ou expiré, pause échue. */
export async function listResumableSends(limit = 20): Promise<{ id: string; organizationId: string }[]> {
  return db
    .select({ id: newsletterSends.id, organizationId: newsletterSends.organizationId })
    .from(newsletterSends)
    .where(
      and(
        isNull(newsletterSends.finishedAt),
        // L'organisation de démo n'est jamais reprise par le cron (docs/module-demo.md §1.3) — l'envoi
        // à la demande, lui, passe (simulé au transport).
        sql`NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = ${newsletterSends.organizationId} AND o.is_demo)`,
        sql`(${newsletterSends.leaseUntil} IS NULL OR ${newsletterSends.leaseUntil} < now())`,
        sql`(${newsletterSends.pausedUntil} IS NULL OR ${newsletterSends.pausedUntil} <= now())`
      )
    )
    .orderBy(newsletterSends.startedAt)
    .limit(limit);
}

/** « Reprendre » à la main : lève la pause et le bail, l'exécutant repart tout de suite. */
export async function unpauseSend(user: OrgScopeUser, sendId: string): Promise<NewsletterSend> {
  const rows = await db.select().from(newsletterSends).where(eq(newsletterSends.id, sendId)).limit(1);
  const send = rows[0];
  if (!send) throw new AppError("envoi_introuvable", undefined, 404);
  assertOrgAccess(user, send.organizationId);
  if (send.finishedAt) throw new AppError("cet_envoi_est_termine");
  await db.update(newsletterSends).set({ pausedUntil: null, pauseReason: null, leaseUntil: null }).where(eq(newsletterSends.id, sendId));
  return send;
}

// ---------------------------------------------------------------------------
// Les agrégats d'une campagne — des comptes, jamais des taux inventés
// ---------------------------------------------------------------------------

export type CampaignStats = {
  recipients: number;
  withoutEmail: number;
  suppressed: number;
  queued: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  failed: number;
  unsubscribed: number;
  /** Les liens cliqués et leur nombre de clics, du plus cliqué au moins. */
  links: { url: string; clicks: number }[];
};

export async function getCampaignStats(newsletterId: string, organizationId: string): Promise<CampaignStats> {
  const [counts, links] = await Promise.all([
    db.execute(sql`
      SELECT
        (SELECT count(*) FROM ${newsletterRecipients} r WHERE r.newsletter_id = ${newsletterId}::uuid) AS recipients,
        (SELECT count(*) FROM ${newsletterRecipients} r JOIN ${contacts} c ON c.id = r.contact_id WHERE r.newsletter_id = ${newsletterId}::uuid AND (c.email IS NULL OR c.email = '')) AS without_email,
        (SELECT count(*) FROM ${newsletterRecipients} r JOIN ${contacts} c ON c.id = r.contact_id
           WHERE r.newsletter_id = ${newsletterId}::uuid AND c.email IS NOT NULL AND c.email <> ''
             AND EXISTS (SELECT 1 FROM ${emailSuppressions} s WHERE s.organization_id = ${organizationId}::uuid AND s.email = lower(c.email)
                         AND s.created_at <= COALESCE((SELECT min(m.created_at) FROM ${emailMessages} m WHERE m.newsletter_id = ${newsletterId}::uuid), now()))) AS suppressed,
        count(*) FILTER (WHERE m.status = 'queued') AS queued,
        count(*) FILTER (WHERE m.status NOT IN ('queued', 'failed', 'draft', 'canceled')) AS sent,
        count(*) FILTER (WHERE m.delivered_at IS NOT NULL) AS delivered,
        count(*) FILTER (WHERE m.first_opened_at IS NOT NULL) AS opened,
        count(*) FILTER (WHERE m.first_clicked_at IS NOT NULL) AS clicked,
        count(*) FILTER (WHERE m.status = 'bounced') AS bounced,
        count(*) FILTER (WHERE m.status = 'failed') AS failed,
        (SELECT count(*) FROM ${emailEvents} e JOIN ${emailMessages} mm ON mm.id = e.message_id WHERE mm.newsletter_id = ${newsletterId}::uuid AND e.type = 'unsubscribed') AS unsubscribed
      FROM ${emailMessages} m
      WHERE m.newsletter_id = ${newsletterId}::uuid AND m.kind = 'newsletter'`),
    db.execute(sql`
      SELECT e.url, count(*)::int AS clicks
      FROM ${emailEvents} e JOIN ${emailMessages} m ON m.id = e.message_id
      WHERE m.newsletter_id = ${newsletterId}::uuid AND e.type = 'clicked' AND e.url IS NOT NULL
      GROUP BY e.url ORDER BY clicks DESC, e.url LIMIT 20`),
  ]);
  const c = counts.rows[0] as Record<string, number | string>;
  const n = (key: string) => Number(c[key] ?? 0);
  return {
    recipients: n("recipients"),
    withoutEmail: n("without_email"),
    suppressed: n("suppressed"),
    queued: n("queued"),
    sent: n("sent"),
    delivered: n("delivered"),
    opened: n("opened"),
    clicked: n("clicked"),
    bounced: n("bounced"),
    failed: n("failed"),
    unsubscribed: n("unsubscribed"),
    links: (links.rows as { url: string; clicks: number }[]).map((r) => ({ url: r.url, clicks: Number(r.clicks) })),
  };
}

// ---------------------------------------------------------------------------
// L'email de test — vers la personne connectée, jamais vers un contact
// ---------------------------------------------------------------------------

export async function createTestMessage(input: {
  organizationId: string;
  newsletterId: string;
  toEmail: string;
  from: string;
  replyTo: string;
  subject: string;
  createdBy: string;
}): Promise<EmailMessage> {
  const rows = await db
    .insert(emailMessages)
    .values({
      organizationId: input.organizationId,
      kind: "test",
      newsletterId: input.newsletterId,
      contactId: null,
      toEmail: input.toEmail.toLowerCase(),
      fromEmail: input.from,
      replyTo: input.replyTo,
      subject: input.subject,
      status: "queued",
      queuedAt: new Date(),
      createdBy: input.createdBy,
    })
    .returning();
  return rows[0];
}

export type TestMessageRow = { id: string; toEmail: string; status: string; sentAt: Date | null; failureReason: string | null; createdAt: Date; senderName: string | null; senderEmail: string | null };

export async function listTestMessages(newsletterId: string): Promise<TestMessageRow[]> {
  return db
    .select({
      id: emailMessages.id,
      toEmail: emailMessages.toEmail,
      status: emailMessages.status,
      sentAt: emailMessages.sentAt,
      failureReason: emailMessages.failureReason,
      createdAt: emailMessages.createdAt,
      senderName: users.name,
      senderEmail: users.email,
    })
    .from(emailMessages)
    .leftJoin(users, eq(emailMessages.createdBy, users.id))
    .where(and(eq(emailMessages.newsletterId, newsletterId), eq(emailMessages.kind, "test")))
    .orderBy(desc(emailMessages.createdAt))
    .limit(10);
}

/** Un message par son id — sans garde d'organisation : réservé aux chemins qui vérifient eux-mêmes (page de désinscription, webhooks). */
export async function getMessageById(id: string): Promise<EmailMessage | null> {
  const rows = await db.select().from(emailMessages).where(eq(emailMessages.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getMessageByProviderId(providerMessageId: string): Promise<EmailMessage | null> {
  const rows = await db.select().from(emailMessages).where(eq(emailMessages.providerMessageId, providerMessageId)).limit(1);
  return rows[0] ?? null;
}

/** Les envois du jour et du mois, toutes natures : ce que l'écran annonce face au quota du plan. */
export async function countSentSince(since: Date): Promise<number> {
  const result = await db.execute(sql`SELECT count(*)::int AS n FROM ${emailMessages} WHERE sent_at >= ${since}`);
  return Number((result.rows[0] as { n: number }).n);
}

/** Les membres d'une cible qui recevraient vraiment un envoi maintenant : une adresse, pas de suppression. */
export async function countSendableMembers(target: TargetLike): Promise<number> {
  const result = await db.execute(sql`
    SELECT count(*)::int AS n FROM ${contacts}
    WHERE ${memberCondition(target)} AND ${contacts.email} IS NOT NULL AND ${contacts.email} <> ''
      AND NOT EXISTS (SELECT 1 FROM ${emailSuppressions} s WHERE s.organization_id = ${target.organizationId}::uuid AND s.email = lower(${contacts.email}))`);
  return Number((result.rows[0] as { n: number }).n);
}

export type SendPhase = "running" | "paused" | "stalled" | "done";

/** Où en est un envoi, lu à l'instant : fini, en pause (échéance à venir), interrompu (bail expiré et file non vide), ou en cours. */
export function sendPhase(send: NewsletterSend | null, now = Date.now()): SendPhase {
  if (!send || send.finishedAt) return "done";
  if (send.pausedUntil && send.pausedUntil.getTime() > now) return "paused";
  if ((!send.leaseUntil || send.leaseUntil.getTime() < now) && send.queued > 0) return "stalled";
  return "running";
}
