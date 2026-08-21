import { integer, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

/**
 * Statuts d'affaire, PAR ORGANISATION — des lignes de table, jamais un enum
 * Postgres figé (même leçon qu'au module mailing pour `mail_targets` : un
 * client doit pouvoir avoir ses propres statuts, son propre ordre, ses
 * propres couleurs, sans migration de schéma).
 *
 * Des valeurs par défaut sont créées avec chaque organisation (côté
 * application, à la création de l'organisation — pas un contenu figé ici),
 * mais restent modifiables ensuite.
 */
export const dealStatuses = pgTable(
  "deal_statuses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Clé stable par organisation (ex: "nouveau"), pas de sens global. */
    slug: text("slug").notNull(),
    label: text("label").notNull(),
    /** Couleur en hexadécimal, pour la vue de suivi par statut. */
    color: text("color"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("deal_statuses_org_slug_unique").on(table.organizationId, table.slug),
    // Cible de la FK composite deals(statusId, organizationId) : un statut
    // assigné à une affaire doit appartenir à la même organisation.
    unique("deal_statuses_id_org_unique").on(table.id, table.organizationId),
  ]
);

export type DealStatus = typeof dealStatuses.$inferSelect;
export type NewDealStatus = typeof dealStatuses.$inferInsert;
