import { integer, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

/**
 * Types d'affaire, PAR ORGANISATION — même principe que `deal_statuses` :
 * des lignes de table, pas un enum figé. Un CGP et un courtier crédit n'ont
 * pas le même vocabulaire de types d'affaires, et le même client doit
 * pouvoir ajuster le sien sans migration.
 */
export const dealTypes = pgTable(
  "deal_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    label: text("label").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("deal_types_org_slug_unique").on(table.organizationId, table.slug),
    // Cible de la FK composite deals(typeId, organizationId) : un type
    // assigné à une affaire doit appartenir à la même organisation.
    unique("deal_types_id_org_unique").on(table.id, table.organizationId),
  ]
);

export type DealType = typeof dealTypes.$inferSelect;
export type NewDealType = typeof dealTypes.$inferInsert;
