import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { deals } from "./deals";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * Les interactions SAISIES À LA MAIN : appel, email (compte rendu — le
 * produit n'envoie rien), rendez-vous, note. Le journal unifié d'une fiche
 * les fusionne À LA LECTURE avec ce que les autres tables savent déjà
 * (changements d'étape, partages, tâches accomplies) — jamais de lignes
 * dupliquées ici pour ces événements-là.
 */
export const activityTypeEnum = pgEnum("activity_type", ["call", "email", "meeting", "note"]);

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    type: activityTypeEnum("type").notNull(),
    /** Le compte rendu, seul champ libre. Supprimé physiquement avec le contact qu'il concerne (pierre tombale, doc §C). */
    content: text("content"),
    /** Date de l'interaction elle-même — saisissable a posteriori, distincte de created_at. */
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    contactId: uuid("contact_id"),
    dealId: uuid("deal_id"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Une interaction sans contact NI affaire n'existe pas.
    check(
      "activities_has_subject",
      sql`${table.contactId} IS NOT NULL OR ${table.dealId} IS NOT NULL`
    ),
    foreignKey({
      name: "activities_contact_org_fk",
      columns: [table.contactId, table.organizationId],
      foreignColumns: [contacts.id, contacts.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "activities_deal_org_fk",
      columns: [table.dealId, table.organizationId],
      foreignColumns: [deals.id, deals.organizationId],
    }).onDelete("cascade"),
    index("activities_org_contact_idx").on(table.organizationId, table.contactId, table.occurredAt),
    index("activities_org_deal_idx").on(table.organizationId, table.dealId, table.occurredAt),
  ]
);

export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;
