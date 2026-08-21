import { foreignKey, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { dealStatuses } from "./deal-statuses";
import { dealTypes } from "./deal-types";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * Une affaire appartient TOUJOURS à l'organisation qui l'a créée — jamais
 * transférée. Ce que le partage fait sortir, c'est une vue limitée sur
 * cette affaire via un jeton (`deal_shares`), jamais l'affaire elle-même ni
 * sa ligne en base.
 */
export const deals = pgTable(
  "deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Nom simple du client concerné — pas de fiche contact complète pour l'instant. */
    clientName: text("client_name").notNull(),
    /** Pas de colonne .references() simple ici : voir la FK composite ci-dessous (deals_type_org_fk). */
    typeId: uuid("type_id").notNull(),
    statusId: uuid("status_id").notNull(),
    /** Montant estimé de l'affaire, en euros. */
    estimatedAmount: numeric("estimated_amount", { precision: 12, scale: 2 }),
    description: text("description"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Cible des FK composites des tables filles (deal_shares, commissions,
    // deal_events) : garantit par la base, pas par convention, qu'une ligne
    // fille ne peut jamais porter un organization_id différent de celui de
    // l'affaire qu'elle référence.
    unique("deals_id_org_unique").on(table.id, table.organizationId),
    // Un type/statut ne peut être assigné à une affaire QUE s'il appartient
    // à la même organisation — sans cette FK composite, type_id pourrait
    // techniquement pointer vers le type d'une autre organisation ; ce
    // n'est pas qu'une question de cohérence, c'est une fuite possible
    // (deviner/énumérer des labels d'une autre organisation).
    foreignKey({
      name: "deals_type_org_fk",
      columns: [table.typeId, table.organizationId],
      foreignColumns: [dealTypes.id, dealTypes.organizationId],
    }),
    foreignKey({
      name: "deals_status_org_fk",
      columns: [table.statusId, table.organizationId],
      foreignColumns: [dealStatuses.id, dealStatuses.organizationId],
    }),
  ]
);

export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;
