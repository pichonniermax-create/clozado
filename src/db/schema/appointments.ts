import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * LES RENDEZ-VOUS d'un contact (chantier engagement, Partie 3) : reçus de
 * Calendly par webhook (`source` = calendly, `external_id` = l'URI de
 * l'invité chez Calendly, unique par organisation — un webhook rejoué ne
 * crée rien) ou saisis en un clic depuis une fiche (`source` = manual).
 * Un rendez-vous annulé reste (statut `canceled`) : « dernier rendez-vous »
 * ne compte que les rendez-vous tenus ou à venir.
 */
export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").notNull(),
    /** La personne de l'organisation qui reçoit (l'hôte Calendly, ou qui saisit). */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    source: text("source").notNull(),
    externalId: text("external_id"),
    title: text("title"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    status: text("status").notNull().default("scheduled"),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "appointments_contact_org_fk",
      columns: [table.contactId, table.organizationId],
      foreignColumns: [contacts.id, contacts.organizationId],
    }).onDelete("cascade"),
    check("appointments_source_check", sql`${table.source} IN ('calendly', 'manual')`),
    check("appointments_status_check", sql`${table.status} IN ('scheduled', 'canceled')`),
    check("appointments_canceled_consistency", sql`(${table.status} = 'canceled') = (${table.canceledAt} IS NOT NULL)`),
    uniqueIndex("appointments_org_external_unique")
      .on(table.organizationId, table.externalId)
      .where(sql`${table.externalId} IS NOT NULL`),
    index("appointments_org_contact_starts_idx").on(table.organizationId, table.contactId, table.startsAt),
    index("appointments_org_starts_idx").on(table.organizationId, table.startsAt),
  ]
);

/**
 * LA CONNEXION D'AGENDA d'une personne (Calendly en v1) : l'abonnement
 * webhook créé en son nom (avec son jeton d'accès, utilisé UNE fois et
 * jamais conservé) et la clé de signature que nous avons générée, chiffrée
 * (AES-256-GCM, clé dérivée d'`AUTH_SECRET`). Une par personne et par
 * fournisseur ; `organization_id` porté pour l'isolation.
 */
export const calendarConnections = pgTable(
  "calendar_connections",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalUserUri: text("external_user_uri"),
    externalOrganizationUri: text("external_organization_uri"),
    subscriptionUri: text("subscription_uri"),
    signingKeyEncrypted: text("signing_key_encrypted").notNull(),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.provider] }),
    check("calendar_connections_provider_check", sql`${table.provider} IN ('calendly')`),
    index("calendar_connections_org_idx").on(table.organizationId),
  ]
);

export type Appointment = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;
export type CalendarConnection = typeof calendarConnections.$inferSelect;
