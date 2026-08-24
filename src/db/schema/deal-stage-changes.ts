import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { dealStatuses } from "./deal-statuses";
import { deals } from "./deals";
import { lossReasons } from "./loss-reasons";
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
    /**
     * Le motif de perte AU MOMENT de la perte — posé quand `to_status_id`
     * est une étape perdue, mis à jour si le motif est corrigé tant que
     * l'affaire y est. `deals.loss_reason_id` n'est que la valeur courante,
     * effacée dès que l'affaire ressort de l'étape : sans cette colonne, une
     * perte passée n'a plus de motif.
     */
    lossReasonId: uuid("loss_reason_id"),
    /**
     * Vrai pour une ligne RECONSTITUÉE par un rattrapage (ligne d'étape
     * initiale déduite de deals.created_at, motif de perte reporté depuis la
     * valeur courante) — une reconstruction, pas une observation.
     * L'analytique les distingue : exclues des durées, comptées à part.
     */
    reconstructed: boolean("reconstructed").notNull().default(false),
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
    foreignKey({
      name: "deal_stage_changes_loss_reason_org_fk",
      columns: [table.lossReasonId, table.organizationId],
      foreignColumns: [lossReasons.id, lossReasons.organizationId],
    }),
    index("deal_stage_changes_org_deal_idx").on(
      table.organizationId,
      table.dealId,
      table.changedAt
    ),
  ]
);

export type DealStageChange = typeof dealStageChanges.$inferSelect;
