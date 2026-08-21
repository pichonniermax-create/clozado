import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { dealStatuses } from "./deal-statuses";
import { deals } from "./deals";
import { organizations } from "./organizations";
import { partners } from "./partners";
import { users } from "./users";

/**
 * Chaque passage d'étape, STRUCTURÉ (deal_events.status_changed n'en garde
 * que le libellé en texte — il raconte, cette table mesure). La durée
 * passée dans une étape = différence entre deux lignes consécutives d'une
 * même affaire. `from_status_id` NULL = première entrée (création de
 * l'affaire ou entrée au pipeline).
 *
 * Les étapes référencées ne sont jamais supprimées (pas de DELETE d'étape
 * dans le produit — on renomme, on réordonne) : l'historique reste
 * calculable sur toute la vie de l'organisation.
 */
export const dealStageChanges = pgTable(
  "deal_stage_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id").notNull(),
    fromStatusId: uuid("from_status_id"),
    toStatusId: uuid("to_status_id").notNull(),
    /** Même règle d'attribution que deal_events : user OU partenaire, jamais les deux ; les deux NULL = système. */
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorPartnerId: uuid("actor_partner_id"),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "deal_stage_changes_single_actor",
      sql`NOT (${table.actorUserId} IS NOT NULL AND ${table.actorPartnerId} IS NOT NULL)`
    ),
    foreignKey({
      name: "deal_stage_changes_deal_org_fk",
      columns: [table.dealId, table.organizationId],
      foreignColumns: [deals.id, deals.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "deal_stage_changes_from_org_fk",
      columns: [table.fromStatusId, table.organizationId],
      foreignColumns: [dealStatuses.id, dealStatuses.organizationId],
    }),
    foreignKey({
      name: "deal_stage_changes_to_org_fk",
      columns: [table.toStatusId, table.organizationId],
      foreignColumns: [dealStatuses.id, dealStatuses.organizationId],
    }),
    foreignKey({
      name: "deal_stage_changes_actor_partner_org_fk",
      columns: [table.actorPartnerId, table.organizationId],
      foreignColumns: [partners.id, partners.organizationId],
    }),
    index("deal_stage_changes_org_deal_idx").on(
      table.organizationId,
      table.dealId,
      table.changedAt
    ),
  ]
);

export type DealStageChange = typeof dealStageChanges.$inferSelect;
