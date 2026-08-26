import { and, desc, eq, inArray, isNotNull, notInArray, or, type SQL } from "drizzle-orm";
import { alias, type AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/db";
import {
  activities,
  contacts,
  dealEvents,
  deals,
  dealShares,
  dealStageChanges,
  dealStatuses,
  leads,
  origins,
  partners,
  tasks,
  users,
  type Activity,
} from "@/db/schema";
import { assertOrgAccess } from "@/db/scope";
import type { OrgScopeUser } from "@/lib/session";
import { PRODUCT_TIMEZONE } from "@/lib/timezone";
import { AppError } from "@/lib/errors";
import type { TranslatorOf } from "@/i18n/translator";

/**
 * L'activité unifiée — le journal d'une fiche contact, d'une affaire, ou de
 * toute l'organisation (tableau de bord). Il n'existe PAS de table
 * « journal » : chaque source garde ses lignes et le journal les fusionne
 * À LA LECTURE (décision posée dès le schéma, voir schema/activities.ts) :
 *
 * - `activities`          : ce qui est saisi à la main (appel, email, rendez-vous, note) ;
 * - `deal_stage_changes`  : chaque passage d'étape, structuré (avant → après) ;
 * - `deal_events`         : ce que le PRM raconte (partages, commentaires,
 *                           commissions) — SAUF `status_changed` et
 *                           `deal_created`, redits ci-dessous par des
 *                           sources plus précises ;
 * - `tasks` achevées      : ce qui a été fait ;
 * - `deals.created_at`    : la naissance de l'affaire, synthétisée depuis la
 *                           ligne elle-même — valable aussi pour les affaires
 *                           d'avant le journal PRM, qui n'ont pas d'événement
 *                           `deal_created` ni de première ligne d'étape.
 *
 * Une fiche contact voit AUSSI ce qui arrive à ses affaires : c'est ce qui
 * rend la vue « unifiée » — appeler un client et voir, dans la même file,
 * que son dossier a été partagé et accepté.
 *
 * Volume borné par construction : chaque source est limitée en base,
 * triée par date, puis les listes sont fusionnées et tronquées — jamais
 * une table entière en mémoire.
 */

export const JOURNAL_LIMIT = 100;

export type JournalKind =
  | Activity["type"]
  | "deal_created"
  | "stage"
  | "share_sent"
  | "share_viewed"
  | "share_accepted"
  | "share_declined"
  | "share_revoked"
  | "share_expired"
  | "commented"
  | "commission_updated"
  | "origin_changed"
  | "task_done"
  | "lead_received";

export type JournalEntry = {
  /** Unique toutes sources confondues (préfixe par source). */
  key: string;
  kind: JournalKind;
  at: Date;
  /** Le texte libre : compte rendu, message, commentaire, titre de la tâche. */
  body: string | null;
  /** Qui — utilisateur interne, partenaire (marqué), ou null (système). */
  actorLabel: string | null;
  /** Le confrère concerné par un partage. */
  partnerName: string | null;
  /** Tâche achevée générée par une règle PRM (badge). */
  autoRule: string | null;
  /** Détail d'un changement d'étape. */
  stage: {
    fromLabel: string | null;
    fromColor: string | null;
    toLabel: string;
    toColor: string | null;
    outcome: "won" | "lost" | null;
  } | null;
  dealId: string | null;
  dealTitle: string | null;
  contactId: string | null;
  contactName: string | null;
  /** Renseigné pour une interaction saisie à la main — la seule entrée qui se supprime. */
  activityId: string | null;
  /** Lead reçu : l'origine (configurée, sinon le texte reçu, sinon le simulateur). */
  originLabel: string | null;
};

export type Journal = { entries: JournalEntry[]; truncated: boolean };

type ActorRow = {
  actorUserId: string | null;
  actorUserName: string | null;
  actorUserEmail: string | null;
  actorPartnerId: string | null;
  actorPartnerName: string | null;
};

/**
 * Un acteur réel dont le nom manque n'est jamais « système » — ce mot est
 * réservé à l'absence d'acteur (ex : expiration constatée hors de toute
 * action humaine), pour ne pas faire passer un geste humain pour un automate.
 */
/** Un champ complété par un lead, stocké par clé — ou, pour les lignes d'avant le chantier i18n, déjà en mots : affiché tel quel. */
const FIELD_KEYS = ["firstName", "lastName", "phone", "companyName", "jobTitle", "city", "postalCode", "country", "notes"] as const;
function fieldLabel(field: string, t: TranslatorOf<"activities.queries">): string {
  return (FIELD_KEYS as readonly string[]).includes(field) ? t(`fields.${field as (typeof FIELD_KEYS)[number]}`) : field;
}

function actorLabelOf(r: ActorRow, t: TranslatorOf<"activities.queries">): string | null {
  if (r.actorUserId) return r.actorUserName || r.actorUserEmail || t("utilisateur");
  if (r.actorPartnerId) return `${r.actorPartnerName ?? "Partenaire"} (partenaire)`;
  return null;
}

type JournalScope = {
  organizationId: string;
  /** Fiche contact : ses interactions et tâches, plus tout ce qui concerne ses affaires. */
  contactId?: string;
  /** Les affaires dont les événements entrent dans le journal. `undefined` = toute l'organisation. */
  dealIds?: string[];
};

/** Rapporte une condition « sujet » ; `null` = la source n'a rien à donner (aucune affaire), on ne l'interroge pas. */
function subjectOf(scope: JournalScope, contactCol: AnyPgColumn | null, dealCol: AnyPgColumn): SQL | undefined | null {
  if (scope.dealIds === undefined && !scope.contactId) return undefined; // organisation entière
  const parts: SQL[] = [];
  if (scope.contactId && contactCol) parts.push(eq(contactCol, scope.contactId));
  if (scope.dealIds && scope.dealIds.length > 0) parts.push(inArray(dealCol, scope.dealIds));
  if (parts.length === 0) return null;
  return parts.length === 1 ? parts[0] : or(...parts);
}

async function collectJournal(scope: JournalScope, limit: number, t: TranslatorOf<"activities.queries">): Promise<Journal> {
  const orgId = scope.organizationId;
  const fromStatus = alias(dealStatuses, "from_status");
  const toStatus = alias(dealStatuses, "to_status");
  const actorPartner = alias(partners, "actor_partner");
  const sharePartner = alias(partners, "share_partner");

  const activitySubject = subjectOf(scope, activities.contactId, activities.dealId);
  const taskSubject = subjectOf(scope, tasks.contactId, tasks.dealId);
  // Les leads parlent d'une personne : sur une fiche contact et sur le fil de
  // l'organisation, jamais sur une affaire (elle montre son champ Origine).
  const leadSubject: SQL | undefined | null =
    scope.dealIds === undefined && !scope.contactId
      ? undefined
      : scope.contactId
        ? eq(leads.contactId, scope.contactId)
        : null;
  const stageSubject = subjectOf(scope, null, dealStageChanges.dealId);
  const eventSubject = subjectOf(scope, null, dealEvents.dealId);
  const dealSubject = subjectOf(scope, null, deals.id);

  const [activityRows, stageRows, eventRows, taskRows, dealRows, leadRows] = await Promise.all([
    activitySubject === null
      ? []
      : db
          .select({
            id: activities.id,
            type: activities.type,
            content: activities.content,
            occurredAt: activities.occurredAt,
            contactId: activities.contactId,
            contactName: contacts.name,
            dealId: activities.dealId,
            dealTitle: deals.title,
            actorUserId: activities.createdBy,
            actorUserName: users.name,
            actorUserEmail: users.email,
          })
          .from(activities)
          .leftJoin(users, eq(activities.createdBy, users.id))
          .leftJoin(contacts, eq(activities.contactId, contacts.id))
          .leftJoin(deals, eq(activities.dealId, deals.id))
          .where(and(eq(activities.organizationId, orgId), activitySubject))
          .orderBy(desc(activities.occurredAt))
          .limit(limit),
    stageSubject === null
      ? []
      : db
          .select({
            id: dealStageChanges.id,
            changedAt: dealStageChanges.changedAt,
            dealId: dealStageChanges.dealId,
            dealTitle: deals.title,
            contactId: deals.contactId,
            contactName: contacts.name,
            fromLabel: fromStatus.label,
            fromColor: fromStatus.color,
            toLabel: toStatus.label,
            toColor: toStatus.color,
            toOutcome: toStatus.outcome,
            actorUserId: dealStageChanges.actorUserId,
            actorUserName: users.name,
            actorUserEmail: users.email,
            actorPartnerId: dealStageChanges.actorPartnerId,
            actorPartnerName: actorPartner.name,
          })
          .from(dealStageChanges)
          .innerJoin(deals, eq(dealStageChanges.dealId, deals.id))
          .leftJoin(contacts, eq(deals.contactId, contacts.id))
          .leftJoin(fromStatus, eq(dealStageChanges.fromStatusId, fromStatus.id))
          .innerJoin(toStatus, eq(dealStageChanges.toStatusId, toStatus.id))
          .leftJoin(users, eq(dealStageChanges.actorUserId, users.id))
          .leftJoin(actorPartner, eq(dealStageChanges.actorPartnerId, actorPartner.id))
          // La première ligne (from NULL) est la création : dite par la source « affaire créée ».
          .where(and(eq(dealStageChanges.organizationId, orgId), isNotNull(dealStageChanges.fromStatusId), stageSubject))
          .orderBy(desc(dealStageChanges.changedAt))
          .limit(limit),
    eventSubject === null
      ? []
      : db
          .select({
            id: dealEvents.id,
            type: dealEvents.type,
            message: dealEvents.message,
            createdAt: dealEvents.createdAt,
            dealId: dealEvents.dealId,
            dealTitle: deals.title,
            contactId: deals.contactId,
            contactName: contacts.name,
            actorUserId: dealEvents.actorUserId,
            actorUserName: users.name,
            actorUserEmail: users.email,
            actorPartnerId: dealEvents.actorPartnerId,
            actorPartnerName: actorPartner.name,
            sharePartnerName: sharePartner.name,
          })
          .from(dealEvents)
          .innerJoin(deals, eq(dealEvents.dealId, deals.id))
          .leftJoin(contacts, eq(deals.contactId, contacts.id))
          .leftJoin(users, eq(dealEvents.actorUserId, users.id))
          .leftJoin(actorPartner, eq(dealEvents.actorPartnerId, actorPartner.id))
          .leftJoin(dealShares, eq(dealEvents.shareId, dealShares.id))
          .leftJoin(sharePartner, eq(dealShares.partnerId, sharePartner.id))
          .where(
            and(
              eq(dealEvents.organizationId, orgId),
              // Les changements d'étape viennent de deal_stage_changes (avant →
              // après) et la création de la ligne `deals` — vérifié en base :
              // aucun status_changed n'existe sans sa ligne structurée.
              notInArray(dealEvents.type, ["status_changed", "deal_created"]),
              eventSubject
            )
          )
          .orderBy(desc(dealEvents.createdAt))
          .limit(limit),
    taskSubject === null
      ? []
      : db
          .select({
            id: tasks.id,
            title: tasks.title,
            completedAt: tasks.completedAt,
            autoRule: tasks.autoRule,
            contactId: tasks.contactId,
            contactName: contacts.name,
            dealId: tasks.dealId,
            dealTitle: deals.title,
            assigneeName: users.name,
            assigneeEmail: users.email,
          })
          .from(tasks)
          .leftJoin(users, eq(tasks.assigneeId, users.id))
          .leftJoin(contacts, eq(tasks.contactId, contacts.id))
          .leftJoin(deals, eq(tasks.dealId, deals.id))
          .where(and(eq(tasks.organizationId, orgId), eq(tasks.status, "done"), taskSubject))
          .orderBy(desc(tasks.completedAt))
          .limit(limit),
    dealSubject === null
      ? []
      : db
          .select({
            id: deals.id,
            title: deals.title,
            createdAt: deals.createdAt,
            contactId: deals.contactId,
            contactName: contacts.name,
            creatorName: users.name,
            creatorEmail: users.email,
            createdBy: deals.createdBy,
          })
          .from(deals)
          .leftJoin(contacts, eq(deals.contactId, contacts.id))
          .leftJoin(users, eq(deals.createdBy, users.id))
          .where(and(eq(deals.organizationId, orgId), dealSubject))
          .orderBy(desc(deals.createdAt))
          .limit(limit),
    leadSubject === null
      ? []
      : db
          .select({
            id: leads.id,
            receivedAt: leads.receivedAt,
            simulator: leads.simulator,
            originRaw: leads.originRaw,
            originLabel: origins.label,
            matched: leads.matchedExistingContact,
            enriched: leads.enrichedFields,
            contactId: leads.contactId,
            contactName: contacts.name,
          })
          .from(leads)
          .leftJoin(origins, eq(leads.originId, origins.id))
          .leftJoin(contacts, eq(leads.contactId, contacts.id))
          .where(and(eq(leads.organizationId, orgId), leadSubject))
          .orderBy(desc(leads.receivedAt))
          .limit(limit),
  ]);

  const entries: JournalEntry[] = [];

  for (const r of activityRows) {
    entries.push({
      key: `act:${r.id}`,
      kind: r.type,
      at: r.occurredAt,
      body: r.content,
      actorLabel: actorLabelOf({ ...r, actorPartnerId: null, actorPartnerName: null }, t),
      partnerName: null,
      autoRule: null,
      stage: null,
      dealId: r.dealId,
      dealTitle: r.dealTitle,
      contactId: r.contactId,
      contactName: r.contactName,
      activityId: r.id,
      originLabel: null,
    });
  }
  for (const r of stageRows) {
    entries.push({
      key: `stage:${r.id}`,
      kind: "stage",
      at: r.changedAt,
      body: null,
      actorLabel: actorLabelOf(r, t),
      partnerName: null,
      autoRule: null,
      stage: {
        fromLabel: r.fromLabel,
        fromColor: r.fromColor,
        toLabel: r.toLabel,
        toColor: r.toColor,
        outcome: r.toOutcome,
      },
      dealId: r.dealId,
      dealTitle: r.dealTitle,
      contactId: r.contactId,
      contactName: r.contactName,
      activityId: null,
      originLabel: null,
    });
  }
  for (const r of eventRows) {
    entries.push({
      key: `event:${r.id}`,
      kind: r.type as JournalKind,
      at: r.createdAt,
      body: r.message,
      actorLabel: actorLabelOf(r, t),
      partnerName: r.sharePartnerName,
      autoRule: null,
      stage: null,
      dealId: r.dealId,
      dealTitle: r.dealTitle,
      contactId: r.contactId,
      contactName: r.contactName,
      activityId: null,
      originLabel: null,
    });
  }
  for (const r of taskRows) {
    entries.push({
      key: `task:${r.id}`,
      kind: "task_done",
      // completed_at est non nul sur une tâche achevée (contrainte tasks_completed_consistency).
      at: r.completedAt ?? new Date(0),
      body: r.title,
      actorLabel: r.assigneeName || r.assigneeEmail || null,
      partnerName: null,
      autoRule: r.autoRule,
      stage: null,
      dealId: r.dealId,
      dealTitle: r.dealTitle,
      contactId: r.contactId,
      contactName: r.contactName,
      activityId: null,
      originLabel: null,
    });
  }
  for (const r of dealRows) {
    entries.push({
      key: `deal:${r.id}`,
      kind: "deal_created",
      at: r.createdAt,
      body: null,
      actorLabel: r.createdBy ? r.creatorName || r.creatorEmail || t("utilisateur") : null,
      partnerName: null,
      autoRule: null,
      stage: null,
      dealId: r.id,
      dealTitle: r.title,
      contactId: r.contactId,
      contactName: r.contactName,
      activityId: null,
      originLabel: null,
    });
  }

  for (const r of leadRows) {
    entries.push({
      key: `lead:${r.id}`,
      kind: "lead_received",
      at: r.receivedAt,
      body: r.matched
        ? r.enriched.length > 0
          ? t("fiche_existante_completee", { join: r.enriched.map((f) => fieldLabel(f, t)).join(", ") })
          : t("fiche_existante_deja_a_jour_rien_e67c")
        : t("nouvelle_fiche_creee"),
      actorLabel: r.simulator ?? "site",
      partnerName: null,
      autoRule: null,
      stage: null,
      dealId: null,
      dealTitle: null,
      contactId: r.contactId,
      contactName: r.contactName,
      activityId: null,
      originLabel: r.originLabel ?? r.originRaw ?? r.simulator ?? t("origine_non_renseignee"),
    });
  }

  entries.sort((a, b) => b.at.getTime() - a.at.getTime() || a.key.localeCompare(b.key));
  return { entries: entries.slice(0, limit), truncated: entries.length > limit };
}

/** Le journal d'une fiche contact : ses interactions, ses tâches faites, et tout ce qui arrive à ses affaires. */
export async function listContactJournal(user: OrgScopeUser, contactId: string, t: TranslatorOf<"activities.queries">, limit = JOURNAL_LIMIT): Promise<Journal> {
  const contact = await db.query.contacts.findFirst({ where: eq(contacts.id, contactId) });
  if (!contact) throw new AppError("contact_introuvable", undefined, 404);
  assertOrgAccess(user, contact.organizationId);

  const contactDeals = await db
    .select({ id: deals.id })
    .from(deals)
    .where(and(eq(deals.organizationId, contact.organizationId), eq(deals.contactId, contactId)));

  return collectJournal(
    { organizationId: contact.organizationId, contactId, dealIds: contactDeals.map((d) => d.id) },
    limit,
    t
  );
}

/** Le journal d'une affaire : ses interactions, ses passages d'étape, son histoire PRM, ses tâches faites. */
export async function listDealJournal(user: OrgScopeUser, dealId: string, t: TranslatorOf<"activities.queries">, limit = JOURNAL_LIMIT): Promise<Journal> {
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  if (!deal) throw new AppError("affaire_introuvable", undefined, 404);
  assertOrgAccess(user, deal.organizationId);
  return collectJournal({ organizationId: deal.organizationId, dealIds: [dealId] }, limit, t);
}

/** L'activité récente de toute l'organisation — le tableau de bord. Vide sans organisation (vue globale super admin). */
export async function listOrganizationJournal(user: OrgScopeUser, limit: number, t: TranslatorOf<"activities.queries">): Promise<Journal> {
  if (!user.organizationId) return { entries: [], truncated: false };
  return collectJournal({ organizationId: user.organizationId }, limit, t);
}

// ---------------------------------------------------------------------------
// Saisie rapide d'une interaction
// ---------------------------------------------------------------------------

/** Tolérance pour « maintenant » saisi à la main : au-delà, c'est une date à venir. */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/** Décalage (minutes) d'un fuseau à un instant donné — « GMT+02:00 » → 120. */
function timezoneOffsetMinutes(timeZone: string, at: Date): number {
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

/**
 * « 2026-08-24T14:30 » (champ datetime-local, sans fuseau) lu comme une
 * heure de Paris — même convention que les échéances des tâches
 * (queries/tasks.ts : la clientèle est française, le serveur est en UTC).
 * Vide ou invalide → null (= maintenant, décidé par l'appelant).
 */
export function parseLocalDateTime(value: string | null | undefined): Date | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const naive = new Date(`${trimmed.length === 16 ? `${trimmed}:00` : trimmed}Z`);
  if (Number.isNaN(naive.getTime())) return null;
  const offset = timezoneOffsetMinutes(PRODUCT_TIMEZONE, naive);
  return new Date(naive.getTime() - offset * 60 * 1000);
}

export type ActivityInput = {
  type: Activity["type"];
  content?: string | null;
  /** Date de l'interaction — null = maintenant. */
  occurredAt?: Date | null;
  contactId?: string | null;
  dealId?: string | null;
};

/**
 * Consigne une interaction sur un contact et/ou une affaire. Consignée
 * depuis une affaire, elle est AUSSI rattachée au client de l'affaire :
 * elle apparaît sur sa fiche, part dans son export, et disparaît avec sa
 * pierre tombale — elle parle de lui.
 */
export async function createActivity(user: OrgScopeUser, createdBy: string, input: ActivityInput) {
  if (!input.contactId && !input.dealId) {
    throw new AppError("une_interaction_se_rattache_a_un_contact_b8a7");
  }

  let organizationId: string | null = null;
  let contactId = input.contactId ?? null;

  if (input.dealId) {
    const deal = await db.query.deals.findFirst({ where: eq(deals.id, input.dealId) });
    if (!deal) throw new AppError("affaire_introuvable", undefined, 404);
    assertOrgAccess(user, deal.organizationId);
    organizationId = deal.organizationId;
    if (!contactId && deal.contactId) contactId = deal.contactId;
  }

  if (contactId) {
    const contact = await db.query.contacts.findFirst({ where: eq(contacts.id, contactId) });
    if (!contact) throw new AppError("contact_introuvable", undefined, 404);
    assertOrgAccess(user, contact.organizationId);
    if (organizationId && contact.organizationId !== organizationId) {
      throw new AppError("ce_contact_et_cette_affaire_n_appartiennent_2f3d");
    }
    if (contact.deletedAt) {
      if (input.contactId) throw new AppError("cette_fiche_a_ete_supprimee_on_n_c812");
      // Affaire dont le client a été supprimé : l'interaction vit sur l'affaire seule.
      contactId = null;
    }
    organizationId = contact.organizationId;
  }

  const content = input.content?.trim() || null;
  if (input.type === "note" && !content) {
    throw new AppError("une_note_sans_texte_n_a_rien_9ef4");
  }
  const occurredAt = input.occurredAt ?? new Date();
  if (occurredAt.getTime() > Date.now() + FUTURE_TOLERANCE_MS) {
    throw new AppError("le_journal_consigne_ce_qui_a_eu_fdc0");
  }

  const [activity] = await db
    .insert(activities)
    .values({
      organizationId: organizationId!,
      type: input.type,
      content,
      occurredAt,
      contactId,
      dealId: input.dealId ?? null,
      createdBy,
    })
    .returning();
  return activity;
}

export async function deleteActivity(user: OrgScopeUser, activityId: string) {
  const activity = await db.query.activities.findFirst({ where: eq(activities.id, activityId) });
  if (!activity) throw new AppError("interaction_introuvable", undefined, 404);
  assertOrgAccess(user, activity.organizationId);
  await db.delete(activities).where(eq(activities.id, activity.id));
}

/** Garde le type hors du modèle exporté : le formulaire envoie une chaîne. */
export function isActivityType(value: string): value is Activity["type"] {
  return value === "call" || value === "email" || value === "meeting" || value === "note";
}
