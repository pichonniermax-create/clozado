import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

/**
 * Un signataire (ex: "Jeevanthy Nivert, Conseillère crédit international")
 * qu'une organisation peut rattacher à une ou plusieurs cibles (mail_targets)
 * comme signataire par défaut des newsletters adressées à cette cible.
 */
export const signatories = pgTable("signatories", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  jobTitle: text("job_title"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Signatory = typeof signatories.$inferSelect;
export type NewSignatory = typeof signatories.$inferInsert;
