import { date, index, integer, numeric, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

/**
 * LES INDICATEURS DE MARCHÉ — des chiffres officiels, vérifiables, datés et
 * sourcés (BCE, Eurostat, Banque de France, INSEE), rafraîchis
 * automatiquement. Le CATALOGUE (clé, libellé, source, unité, périodicité,
 * spécification d'appel, métiers concernés) vit dans le code, en données
 * (src/lib/watch/indicators.ts), comme les packs métier : un indicateur
 * s'ajoute sans migration. Ne code aucun chiffre en dur, jamais : ici ne
 * vivent que des OBSERVATIONS telles que publiées.
 *
 * `market_observations` est la SEULE table du produit sans organisation —
 * exception assumée et validée : un taux de la BCE n'appartient à personne,
 * le stocker quatre fois avec quatre dates serait faux. Ce qu'une
 * organisation en fait (l'indicateur qu'elle suit, sa copie datée dans ses
 * chiffres vérifiés) reste scopé.
 */
export const marketObservations = pgTable(
  "market_observations",
  {
    indicatorKey: text("indicator_key").notNull(),
    /** La période telle que publiée (« 2026-08-25 », « 2026-07 », « 2026-T2 »). */
    period: text("period").notNull(),
    /** Le premier jour de la période, pour trier et comparer. */
    periodStart: date("period_start").notNull(),
    /** La valeur exactement comme publiée (« 2,25 », « 3.85 »). */
    valueText: text("value_text").notNull(),
    valueNum: numeric("value_num", { precision: 18, scale: 6 }),
    unit: text("unit"),
    sourceName: text("source_name").notNull(),
    sourceUrl: text("source_url").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.indicatorKey, table.period] }),
    index("market_observations_key_start_idx").on(table.indicatorKey, table.periodStart),
  ]
);

/** La santé de chaque indicateur (une ligne par clé du catalogue) : une API officielle muette laisse la dernière observation affichée AVEC sa date. */
export const marketIndicatorStatus = pgTable("market_indicator_status", {
  indicatorKey: text("indicator_key").primaryKey(),
  lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
  lastOkAt: timestamp("last_ok_at", { withTimezone: true }),
  lastError: text("last_error"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
});

/** Les indicateurs qu'une organisation SUIT (préremplis depuis son pack métier, modifiables) — scopé, lui. */
export const organizationIndicators = pgTable(
  "organization_indicators",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    indicatorKey: text("indicator_key").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.indicatorKey] })]
);

export type MarketObservation = typeof marketObservations.$inferSelect;
export type OrganizationIndicator = typeof organizationIndicators.$inferSelect;
