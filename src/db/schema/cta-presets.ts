import { integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { mailTargets } from "./mail-targets";
import { organizations } from "./organizations";

/**
 * URL de destination autorisée pour un bloc CTA/bouton, par organisation.
 * Jamais de champ URL vide par défaut dans l'éditeur : on choisit parmi les
 * presets de l'organisation.
 */
export const ctaPresets = pgTable("cta_presets", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  /** Libellé de bouton par défaut (ex: "Simulez votre prêt"). */
  label: text("label").notNull(),
  url: text("url").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Un preset CTA peut être pertinent pour plusieurs cibles (ex: un même RDV
 * proposé à deux personas) — association explicite en table de jonction,
 * pas de "s'applique à toutes les cibles" implicite.
 */
export const ctaPresetTargets = pgTable(
  "cta_preset_targets",
  {
    ctaPresetId: uuid("cta_preset_id")
      .notNull()
      .references(() => ctaPresets.id, { onDelete: "cascade" }),
    targetId: uuid("target_id")
      .notNull()
      .references(() => mailTargets.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.ctaPresetId, table.targetId] })]
);

export type CtaPreset = typeof ctaPresets.$inferSelect;
export type NewCtaPreset = typeof ctaPresets.$inferInsert;
