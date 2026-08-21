import { integer, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

/**
 * Motifs de perte d'une affaire, PAR ORGANISATION — des lignes de table,
 * jamais un enum figé : « taux concurrent », « dossier refusé banque »,
 * « projet abandonné » ne sont pas le même vocabulaire chez un courtier
 * crédit et chez un CGP.
 */
export const lossReasons = pgTable(
  "loss_reasons",
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
    uniqueIndex("loss_reasons_org_label_unique").on(table.organizationId, table.label),
    unique("loss_reasons_id_org_unique").on(table.id, table.organizationId),
  ]
);

export type LossReason = typeof lossReasons.$inferSelect;
export type NewLossReason = typeof lossReasons.$inferInsert;
