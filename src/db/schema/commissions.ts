import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { dealShares } from "./deal-shares";
import { deals } from "./deals";
import { organizations } from "./organizations";

export const commissionBasisEnum = pgEnum("commission_basis", ["percentage", "fixed"]);

/** prevue (à l'envoi) → confirmee (l'affaire aboutit, montant arrêté) → reglee (versée hors de l'outil, simple déclaration). */
export const commissionStateEnum = pgEnum("commission_state", ["prevue", "confirmee", "reglee"]);

/**
 * L'outil ENREGISTRE et CALCULE une commission ; il ne verse rien et
 * n'encaisse rien — aucune fonction de paiement. `state = 'reglee'` est une
 * simple déclaration ("ça a été payé, ailleurs"), jamais un virement
 * déclenché par l'outil.
 */
export const commissions = pgTable(
  "commissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id").notNull(),
    shareId: uuid("share_id").notNull(),
    basis: commissionBasisEnum("basis").notNull(),
    /** Taux en %, requis seulement si basis = 'percentage'. */
    rate: numeric("rate", { precision: 5, scale: 2 }),
    /** Montant fixe, requis seulement si basis = 'fixed'. */
    fixedAmount: numeric("fixed_amount", { precision: 12, scale: 2 }),
    /** Montant sur lequel le taux s'applique (souvent l'estimation de l'affaire, peut différer). */
    baseAmount: numeric("base_amount", { precision: 12, scale: 2 }),
    /** Montant calculé, figé au moment du calcul — pas recalculé silencieusement si le taux ou la base change ensuite. */
    computedAmount: numeric("computed_amount", { precision: 12, scale: 2 }),
    state: commissionStateEnum("state").notNull().default("prevue"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "commissions_basis_fields_consistency",
      sql`(${table.basis} = 'percentage' AND ${table.rate} IS NOT NULL AND ${table.fixedAmount} IS NULL)
        OR (${table.basis} = 'fixed' AND ${table.fixedAmount} IS NOT NULL AND ${table.rate} IS NULL)`
    ),
    // Même invariant garanti par la base que deal_shares : une commission
    // ne peut référencer une affaire/un partage que de sa propre organisation.
    foreignKey({
      name: "commissions_deal_org_fk",
      columns: [table.dealId, table.organizationId],
      foreignColumns: [deals.id, deals.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "commissions_share_org_fk",
      columns: [table.shareId, table.organizationId],
      foreignColumns: [dealShares.id, dealShares.organizationId],
    }).onDelete("cascade"),
  ]
);

export type Commission = typeof commissions.$inferSelect;
export type NewCommission = typeof commissions.$inferInsert;
