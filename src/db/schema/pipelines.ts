import { integer, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

/**
 * Un pipeline = une famille d'affaires avec ses propres étapes (crédit,
 * placement, transaction…). PLUSIEURS par organisation. Les étapes sont
 * les lignes de `deal_statuses` rattachées au pipeline — pas une table à
 * part : le pipeline et le PRM regardent le même objet.
 *
 * Pas de slug : aucune ligne de code ne référence un pipeline précis (le
 * pipeline « par défaut » créé à la migration n'est qu'une ligne comme les
 * autres).
 */
export const pipelines = pgTable(
  "pipelines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("pipelines_org_label_unique").on(table.organizationId, table.label),
    // Cible des FK composites de deal_statuses et deals.
    unique("pipelines_id_org_unique").on(table.id, table.organizationId),
  ]
);

export type Pipeline = typeof pipelines.$inferSelect;
export type NewPipeline = typeof pipelines.$inferInsert;
