import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

/**
 * SOURCE UNIQUE des chiffres que l'IA a le droit de citer sans placeholder,
 * par organisation. Lue à la fois par le compositeur de prompt et par le
 * vérificateur déterministe post-génération — jamais deux copies (§8 point 2
 * du dossier de reconstruction : la désynchronisation entre le prompt et le
 * vérificateur était une classe de bug entière sur le projet d'origine).
 */
export const verifiedFigures = pgTable("verified_figures", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  /** Description courte à l'usage de l'admin (ex: "Dossiers financés"). */
  label: text("label").notNull(),
  /** Chaîne exacte citable telle qu'elle doit apparaître, ex: "910", "95 %", "680 M€". */
  value: text("value").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VerifiedFigure = typeof verifiedFigures.$inferSelect;
export type NewVerifiedFigure = typeof verifiedFigures.$inferInsert;
