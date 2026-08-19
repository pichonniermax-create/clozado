import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Un "organizations" = un espace client isolé (un courtier, une PME...).
 * Toute donnée métier de l'app appartiendra toujours à une organisation.
 */
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** Identifiant court et lisible (ex: "dupont"), unique. Utile pour de futures URLs propres. */
  slug: text("slug").notNull().unique(),
  // --- Marque blanche (socle) ---
  /** Lien vers une image déjà hébergée ailleurs, pas d'upload pour l'instant. */
  logoUrl: text("logo_url"),
  /** Couleur principale de la marque, en hexadécimal (ex: "#2563eb"). */
  primaryColor: text("primary_color"),
  /** Nom de la police souhaitée (ex: "Inter"), simple préférence stockée. */
  fontFamily: text("font_family"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
