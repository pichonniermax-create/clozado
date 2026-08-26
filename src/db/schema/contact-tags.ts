import { foreignKey, index, integer, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { organizations } from "./organizations";

/**
 * Étiquettes de contact, PAR ORGANISATION — des lignes de table, jamais un
 * enum figé (même principe que deal_statuses). Pas de slug : aucune ligne
 * de code ne référencera jamais une étiquette précise, le libellé suffit.
 */
export const contactTags = pgTable(
  "contact_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    /** Couleur en hexadécimal, choisie par l'organisation. */
    color: text("color"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("contact_tags_org_label_unique").on(table.organizationId, table.label),
    unique("contact_tags_id_org_unique").on(table.id, table.organizationId),
  ]
);

/**
 * Pose d'une étiquette sur un contact. `organization_id` dénormalisé et
 * GARANTI par les deux FK composites : impossible d'étiqueter le contact
 * d'une organisation avec l'étiquette d'une autre.
 */
export const contactTagAssignments = pgTable(
  "contact_tag_assignments",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").notNull(),
    tagId: uuid("tag_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.contactId, table.tagId] }),
    foreignKey({
      name: "contact_tag_assignments_contact_org_fk",
      columns: [table.contactId, table.organizationId],
      foreignColumns: [contacts.id, contacts.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "contact_tag_assignments_tag_org_fk",
      columns: [table.tagId, table.organizationId],
      foreignColumns: [contactTags.id, contactTags.organizationId],
    }).onDelete("cascade"),
    // « Les contacts qui portent cette étiquette » (critère de cible) : la
    // clé primaire (contact, étiquette) ne sert que l'autre sens.
    index("contact_tag_assignments_org_tag_contact_idx").on(table.organizationId, table.tagId, table.contactId),
  ]
);

export type ContactTag = typeof contactTags.$inferSelect;
export type NewContactTag = typeof contactTags.$inferInsert;
