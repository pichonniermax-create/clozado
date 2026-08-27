import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { activities } from "./activities";
import { contacts } from "./contacts";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * LES EMAILS REÇUS sur l'adresse d'ingestion d'une organisation (chantier
 * engagement, Partie 2) — transférés ou mis en copie par un membre. Une
 * ligne par email accepté à l'adresse d'une organisation, quel que soit
 * son sort : `rejected` (expéditeur inconnu ou non authentifié, débit,
 * taille — avec le motif), `pending` (la proposition attend une
 * confirmation humaine), `confirmed` (le contact créé ou enrichi,
 * l'interaction posée), `ignored`.
 *
 * Le contenu entrant est NON FIABLE : `proposal` est ce que le parseur
 * PROPOSE (champs, score), jamais écrit sur une fiche sans confirmation ;
 * `body_text` n'est conservé que si l'organisation l'a activé
 * (`organizations.store_inbound_bodies`), sinon NULL par construction.
 * `auth_result`/`auth_detail` : le verdict de l'authentification de
 * l'expéditeur calculé par nous (DKIM aligné, sinon SPF aligné) — la
 * preuve de « l'expéditeur authentifié, pas le simple champ From ».
 */
export const inboundEmails = pgTable(
  "inbound_emails",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    providerEmailId: text("provider_email_id").notNull(),
    messageIdHeader: text("message_id_header"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    /** L'adresse de l'en-tête From, en minuscules. */
    senderEmail: text("sender_email").notNull(),
    senderUserId: uuid("sender_user_id").references(() => users.id, { onDelete: "set null" }),
    authResult: text("auth_result").notNull(),
    authDetail: jsonb("auth_detail"),
    status: text("status").notNull(),
    rejectionReason: text("rejection_reason"),
    /** `forward` (l'email d'un contact, transféré) ou `copy` (l'email du membre au contact, en Cci). */
    mode: text("mode"),
    subject: text("subject"),
    /** La contrepartie résolue : le contact (expéditeur d'origine en transfert, destinataire en copie). */
    counterpartEmail: text("counterpart_email"),
    counterpartName: text("counterpart_name"),
    /** La date de l'email d'origine (transfert) ou de l'email lui-même (copie). */
    originalDate: timestamp("original_date", { withTimezone: true }),
    contactId: uuid("contact_id"),
    activityId: uuid("activity_id").references(() => activities.id, { onDelete: "set null" }),
    proposal: jsonb("proposal"),
    bodyText: text("body_text"),
    sizeBytes: integer("size_bytes"),
    confirmedBy: uuid("confirmed_by").references(() => users.id, { onDelete: "set null" }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "inbound_emails_contact_org_fk",
      columns: [table.contactId, table.organizationId],
      foreignColumns: [contacts.id, contacts.organizationId],
    }).onDelete("cascade"),
    uniqueIndex("inbound_emails_provider_id_unique").on(table.providerEmailId),
    check("inbound_emails_status_check", sql`${table.status} IN ('pending', 'confirmed', 'ignored', 'rejected')`),
    check("inbound_emails_auth_check", sql`${table.authResult} IN ('dkim_aligned', 'spf_aligned', 'failed', 'unavailable')`),
    check("inbound_emails_mode_check", sql`${table.mode} IS NULL OR ${table.mode} IN ('forward', 'copy')`),
    index("inbound_emails_org_received_idx").on(table.organizationId, table.receivedAt),
    index("inbound_emails_org_status_idx").on(table.organizationId, table.status),
  ]
);

/**
 * Ce que l'ingestion a REFUSÉ SANS ORGANISATION — une adresse d'ingestion
 * inconnue : par construction, aucune organisation à qui l'attribuer. Un
 * compteur par (motif, détail — les premiers caractères de l'adresse
 * visée), incrémenté, jamais une ligne par email : une attaque ne remplit
 * pas la table. Deuxième table du produit sans organisation, après
 * `market_observations` — exception assumée pour la même raison : la
 * donnée n'appartient à personne.
 */
export const inboundRejections = pgTable(
  "inbound_rejections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reason: text("reason").notNull(),
    detail: text("detail").notNull(),
    count: integer("count").notNull().default(1),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("inbound_rejections_reason_detail_unique").on(table.reason, table.detail)]
);

export type InboundEmail = typeof inboundEmails.$inferSelect;
export type InboundRejection = typeof inboundRejections.$inferSelect;
