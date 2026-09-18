import { createHash } from "node:crypto";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { emailMessages, emailSuppressions, organizations, platformSuppressions } from "@/db/schema";
import { AppError } from "@/lib/errors";

/**
 * LES GARDE-FOUS D'ENVOI (chantier envoi, partie 1).
 *
 * Trois choses vivent ici, et rien d'autre :
 *
 * 1. **La liste repoussoir de la PLATEFORME** — un rebond dur ou une
 *    plainte ne parlent pas de la relation avec un cabinet, ils parlent de
 *    l'adresse et de la réputation de tout le service. Stockée en
 *    empreintes (sha256), jamais en clair.
 * 2. **Le quota du jour et la montée progressive** — un domaine neuf qui
 *    part à 5 000 messages se fait classer en spam le premier jour. La
 *    montée suit un palier par jour d'échauffement, plafonné par le quota
 *    de l'organisation.
 * 3. **La pause automatique sur seuils** — au-dessus de 0,3 % de plaintes
 *    ou de 5 % de rebonds durs sur les sept derniers jours, l'envoi
 *    MARKETING s'arrête tout seul et le dit. Le seuil de plaintes est celui
 *    que Google et Yahoo exigent publiquement des expéditeurs en masse
 *    (« keep spam rates below 0.3 % ») ; celui des rebonds est la pratique
 *    courante des fournisseurs d'envoi. Les emails RELATIONNELS (lien de
 *    connexion, confirmation de rendez-vous, partage) ne sont jamais
 *    suspendus : ils ne sont pas du marketing, et les couper ferait plus de
 *    mal que de bien.
 *
 * Rien ici ne décide de ce qui est « autorisé » au sens du droit : c'est le
 * statut d'autorisation du contact (`contacts.email_consent_status`,
 * journal `consent_events`) qui le dit, et la sélection des destinataires
 * qui l'applique.
 */

/** L'empreinte d'une adresse : minuscules, sans espace, sha256 hexadécimal. */
export function emailFingerprint(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

/** L'expression SQL de la même empreinte, pour filtrer une sélection sans repasser par le code. */
export function emailFingerprintSql(column: ReturnType<typeof sql>): ReturnType<typeof sql> {
  return sql`encode(sha256(convert_to(lower(trim(${column})), 'UTF8')), 'hex')`;
}

/**
 * Le seuil de plaintes exigé par les grands récepteurs (Google, Yahoo) pour
 * un expéditeur en masse. Au-dessus, ce n'est plus un incident : c'est une
 * campagne qui abîme la réputation de tout le monde.
 */
export const COMPLAINT_RATE_LIMIT = 0.003;
/** Au-dessus, les adresses envoyées ne valent plus rien : la liste est à nettoyer avant de repartir. */
export const BOUNCE_RATE_LIMIT = 0.05;
/** En dessous de ce volume sur la fenêtre, un taux ne veut rien dire : une plainte sur trois messages n'est pas 33 %. */
export const HEALTH_MIN_VOLUME = 50;
/** La fenêtre glissante sur laquelle les taux se lisent. */
export const HEALTH_WINDOW_DAYS = 7;

/**
 * LA MONTÉE PROGRESSIVE, par jour d'échauffement. Un palier par jour, qui
 * double à peu près : c'est la forme que recommandent les fournisseurs
 * d'envoi pour un domaine neuf. Au-delà du dernier palier, seul le quota de
 * l'organisation compte.
 */
export const WARMUP_LADDER = [50, 100, 250, 500, 1000, 2000, 4000] as const;

/** Le plafond du jour pour une organisation qui s'échauffe ; `null` quand l'échauffement est terminé ou jamais commencé. */
export function warmupCap(startedAt: Date | null, now: Date = new Date()): number | null {
  if (!startedAt) return null;
  const days = Math.floor((now.getTime() - startedAt.getTime()) / 86_400_000);
  if (days < 0) return WARMUP_LADDER[0];
  return days < WARMUP_LADDER.length ? WARMUP_LADDER[days] : null;
}

export type SendingAllowance = {
  /** Le plafond du jour : le quota de l'organisation, abaissé par l'échauffement s'il court encore. */
  quota: number;
  /** Envoyés depuis minuit (fuseau de l'organisation), marketing seulement. */
  sentToday: number;
  remaining: number;
  paused: boolean;
  pauseReason: string | null;
  /** Le jour d'échauffement en cours (1 = premier jour), ou `null`. */
  warmupDay: number | null;
};

/**
 * CE QUE CETTE ORGANISATION PEUT ENCORE ENVOYER AUJOURD'HUI. Le compte ne
 * porte que sur les emails MARKETING (`kind = 'newsletter'`) : un lien de
 * connexion ou une confirmation de rendez-vous n'entame aucun quota.
 */
export async function sendingAllowance(organizationId: string, timeZone: string): Promise<SendingAllowance> {
  const [org] = await db
    .select({
      quota: organizations.dailySendQuota,
      warmupStartedAt: organizations.sendWarmupStartedAt,
      pausedAt: organizations.sendingPausedAt,
      pauseReason: organizations.sendingPauseReason,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  if (!org) throw new AppError("organisation_introuvable", undefined, 404);

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(emailMessages)
    .where(
      and(
        eq(emailMessages.organizationId, organizationId),
        eq(emailMessages.kind, "newsletter"),
        // « Aujourd'hui » se lit dans le fuseau de l'organisation, comme partout ailleurs dans le produit.
        sql`${emailMessages.sentAt} >= date_trunc('day', now() AT TIME ZONE ${timeZone}) AT TIME ZONE ${timeZone}`
      )
    );

  const cap = warmupCap(org.warmupStartedAt, new Date());
  const quota = cap === null ? org.quota : Math.min(cap, org.quota);
  const days = org.warmupStartedAt ? Math.floor((Date.now() - org.warmupStartedAt.getTime()) / 86_400_000) : null;
  return {
    quota,
    sentToday: n,
    remaining: Math.max(0, quota - n),
    paused: org.pausedAt !== null,
    pauseReason: org.pauseReason,
    warmupDay: cap === null || days === null ? null : days + 1,
  };
}

// ---------------------------------------------------------------------------
// La liste repoussoir de la plateforme
// ---------------------------------------------------------------------------

/** Cette adresse est-elle grillée pour TOUT le service ? */
export async function isPlatformSuppressed(email: string): Promise<boolean> {
  const rows = await db
    .select({ reason: platformSuppressions.reason })
    .from(platformSuppressions)
    .where(eq(platformSuppressions.emailSha256, emailFingerprint(email)))
    .limit(1);
  return rows.length > 0;
}

/**
 * Consigne un rebond DUR ou une plainte au niveau de la plateforme. Idempotent :
 * un second événement sur la même adresse incrémente le compteur et la date,
 * il ne crée pas de ligne.
 */
export async function recordPlatformSuppression(input: { email: string; reason: "bounced" | "complained"; detail?: string | null }): Promise<void> {
  await db
    .insert(platformSuppressions)
    .values({
      emailSha256: emailFingerprint(input.email),
      reason: input.reason,
      detail: input.detail?.slice(0, 500) ?? null,
    })
    .onConflictDoUpdate({
      target: platformSuppressions.emailSha256,
      set: {
        occurrences: sql`${platformSuppressions.occurrences} + 1`,
        lastSeenAt: new Date(),
        // Une plainte est plus grave qu'un rebond : elle prend le dessus et ne redescend pas.
        reason: sql`CASE WHEN ${platformSuppressions.reason} = 'complained' THEN 'complained' ELSE ${input.reason} END`,
      },
    });
}

// ---------------------------------------------------------------------------
// La santé d'envoi, et la pause automatique
// ---------------------------------------------------------------------------

export type SendingHealthRow = {
  organizationId: string;
  name: string;
  slug: string;
  /** Sur la fenêtre (7 jours) : marketing seulement. */
  sent: number;
  delivered: number;
  bounced: number;
  complained: number;
  bounceRate: number | null;
  complaintRate: number | null;
  /** Assez de volume pour qu'un taux veuille dire quelque chose. */
  significant: boolean;
  paused: boolean;
  pauseReason: string | null;
  pausedAt: Date | null;
  quota: number;
  warmupStartedAt: Date | null;
  /** Adresses que CETTE organisation ne touche plus (désinscriptions comprises). */
  suppressions: number;
};

/**
 * L'ÉTAT D'ENVOI DE CHAQUE ORGANISATION — l'écran du super admin. Une seule
 * requête : volumes et événements de la fenêtre, pause, quota, liste
 * repoussoir de l'organisation.
 */
export async function sendingHealth(): Promise<SendingHealthRow[]> {
  const rows = await db.execute(sql`
    SELECT o.id, o.name, o.slug, o.daily_send_quota, o.send_warmup_started_at, o.sending_paused_at, o.sending_pause_reason,
      coalesce(m.sent, 0) AS sent, coalesce(m.delivered, 0) AS delivered, coalesce(m.bounced, 0) AS bounced, coalesce(m.complained, 0) AS complained,
      coalesce(s.n, 0) AS suppressions
    FROM organizations o
    LEFT JOIN (
      SELECT organization_id,
        count(*) FILTER (WHERE status <> 'queued') AS sent,
        count(*) FILTER (WHERE status = 'delivered') AS delivered,
        count(*) FILTER (WHERE status = 'bounced') AS bounced,
        count(*) FILTER (WHERE status = 'complained') AS complained
      FROM email_messages
      WHERE kind = 'newsletter' AND queued_at >= now() - make_interval(days => ${HEALTH_WINDOW_DAYS})
      GROUP BY organization_id
    ) m ON m.organization_id = o.id
    LEFT JOIN (SELECT organization_id, count(*) AS n FROM email_suppressions GROUP BY organization_id) s ON s.organization_id = o.id
    ORDER BY coalesce(m.sent, 0) DESC, o.name
  `);
  return (rows.rows as Record<string, unknown>[]).map((r) => {
    const sent = Number(r.sent) || 0;
    const bounced = Number(r.bounced) || 0;
    const complained = Number(r.complained) || 0;
    return {
      organizationId: String(r.id),
      name: String(r.name),
      slug: String(r.slug),
      sent,
      delivered: Number(r.delivered) || 0,
      bounced,
      complained,
      bounceRate: sent > 0 ? bounced / sent : null,
      complaintRate: sent > 0 ? complained / sent : null,
      significant: sent >= HEALTH_MIN_VOLUME,
      paused: r.sending_paused_at !== null,
      pauseReason: (r.sending_pause_reason as string | null) ?? null,
      pausedAt: r.sending_paused_at ? new Date(String(r.sending_paused_at)) : null,
      quota: Number(r.daily_send_quota) || 0,
      warmupStartedAt: r.send_warmup_started_at ? new Date(String(r.send_warmup_started_at)) : null,
      suppressions: Number(r.suppressions) || 0,
    };
  });
}

/** Met l'envoi marketing d'une organisation en pause, ou le relance. La cohérence (date ⇔ motif) est tenue par la base. */
export async function setSendingPause(organizationId: string, reason: string | null): Promise<void> {
  await db
    .update(organizations)
    .set(
      reason
        ? { sendingPausedAt: new Date(), sendingPauseReason: reason.slice(0, 200) }
        : { sendingPausedAt: null, sendingPauseReason: null }
    )
    .where(eq(organizations.id, organizationId));
}

/**
 * LA PAUSE AUTOMATIQUE — appelée après chaque rebond dur et chaque plainte.
 * Elle ne relance JAMAIS toute seule : reprendre est une décision humaine
 * (on nettoie la liste d'abord). Rend le motif posé, ou `null`.
 */
export async function evaluateAutoPause(organizationId: string): Promise<string | null> {
  const [row] = (await db.execute(sql`
    SELECT count(*) FILTER (WHERE status <> 'queued') AS sent,
           count(*) FILTER (WHERE status = 'bounced') AS bounced,
           count(*) FILTER (WHERE status = 'complained') AS complained,
           (SELECT sending_paused_at FROM organizations WHERE id = ${organizationId}) AS paused_at
    FROM email_messages
    WHERE organization_id = ${organizationId} AND kind = 'newsletter'
      AND queued_at >= now() - make_interval(days => ${HEALTH_WINDOW_DAYS})
  `)).rows as { sent: string; bounced: string; complained: string; paused_at: string | null }[];
  if (!row || row.paused_at) return null;
  const sent = Number(row.sent) || 0;
  if (sent < HEALTH_MIN_VOLUME) return null;
  const complaintRate = (Number(row.complained) || 0) / sent;
  const bounceRate = (Number(row.bounced) || 0) / sent;
  const reason =
    complaintRate >= COMPLAINT_RATE_LIMIT
      ? `complaint_rate:${(complaintRate * 100).toFixed(2)}%`
      : bounceRate >= BOUNCE_RATE_LIMIT
        ? `bounce_rate:${(bounceRate * 100).toFixed(2)}%`
        : null;
  if (!reason) return null;
  await setSendingPause(organizationId, reason);
  return reason;
}

/** Les dernières adresses grillées côté plateforme — l'écran du super admin les compte, sans jamais les montrer en clair. */
export async function platformSuppressionCounts(): Promise<{ bounced: number; complained: number; last: Date | null }> {
  const [row] = (await db.execute(sql`
    SELECT count(*) FILTER (WHERE reason = 'bounced') AS bounced,
           count(*) FILTER (WHERE reason = 'complained') AS complained,
           max(last_seen_at) AS last
    FROM platform_suppressions
  `)).rows as { bounced: string; complained: string; last: string | null }[];
  return { bounced: Number(row?.bounced) || 0, complained: Number(row?.complained) || 0, last: row?.last ? new Date(row.last) : null };
}

/** Les organisations en pause, pour le bandeau d'alerte du super admin. */
export async function pausedOrganizations(): Promise<{ id: string; name: string; reason: string | null; since: Date }[]> {
  const rows = await db
    .select({ id: organizations.id, name: organizations.name, reason: organizations.sendingPauseReason, since: organizations.sendingPausedAt })
    .from(organizations)
    .where(sql`${organizations.sendingPausedAt} IS NOT NULL`)
    .orderBy(desc(organizations.sendingPausedAt));
  return rows.map((r) => ({ id: r.id, name: r.name, reason: r.reason, since: r.since! }));
}

/** Utilisé par la sélection des destinataires : l'adresse est-elle déjà exclue par CETTE organisation ? */
export async function orgSuppressionCount(organizationId: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(emailSuppressions)
    .where(and(eq(emailSuppressions.organizationId, organizationId), gte(emailSuppressions.createdAt, new Date(0))));
  return n;
}
