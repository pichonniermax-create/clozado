import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { mailTargets } from "./mail-targets";
import { organizations } from "./organizations";
import { users } from "./users";

export const newsletters = pgTable("newsletters", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Sans titre"),
  targetId: uuid("target_id")
    .notNull()
    .references(() => mailTargets.id),
  subject: text("subject"),
  preheader: text("preheader"),
  /** Brief saisi, réutilisé par "Concevoir avec l'IA". */
  brief: text("brief"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Blocs normalisés d'une newsletter. `type` est stocké en texte, pas en enum
 * Postgres : le registre zod des blocs (src/lib/newsletter/blocks.ts) reste
 * l'unique source de vérité sur les types valides, et c'est de lui que sera
 * généré le schéma d'outil transmis à l'IA — jamais deux définitions
 * maintenues séparément (§8 point 3 du dossier de reconstruction).
 */
export const newsletterBlocks = pgTable("newsletter_blocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  newsletterId: uuid("newsletter_id")
    .notNull()
    .references(() => newsletters.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  position: integer("position").notNull().default(0),
  payload: jsonb("payload").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Newsletter = typeof newsletters.$inferSelect;
export type NewNewsletter = typeof newsletters.$inferInsert;
export type NewsletterBlock = typeof newsletterBlocks.$inferSelect;
export type NewNewsletterBlock = typeof newsletterBlocks.$inferInsert;
