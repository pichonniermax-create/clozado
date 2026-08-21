import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { pipelines } from "./pipelines";

/**
 * Marqueur de fin d'une étape : gagnée, perdue, ou ni l'un ni l'autre
 * (étape intermédiaire). Protocole technique fixe — QUELLES étapes portent
 * le marqueur est configurable, le marqueur lui-même ne l'est pas.
 */
export const stageOutcomeEnum = pgEnum("stage_outcome", ["won", "lost"]);

/**
 * Statuts d'affaire = ÉTAPES DE PIPELINE, PAR ORGANISATION — des lignes de
 * table, jamais un enum Postgres figé. C'est LA table que le module
 * relationnel et le module PRM regardent tous les deux : le pipeline
 * l'affiche en colonnes kanban, la vitrine de partage l'affiche comme
 * statut au partenaire — le même objet, deux angles (décision A,
 * docs/module-relationnel.md).
 *
 * Des valeurs par défaut sont créées avec chaque organisation (côté
 * application) mais restent modifiables ensuite. Les étapes ne se
 * SUPPRIMENT pas (l'historique deal_stage_changes les référence) : on
 * renomme, on réordonne.
 */
export const dealStatuses = pgTable(
  "deal_statuses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Le pipeline auquel l'étape appartient. */
    pipelineId: uuid("pipeline_id").notNull(),
    /** Clé stable par organisation et pipeline (ex: "nouveau"), pas de sens global. */
    slug: text("slug").notNull(),
    label: text("label").notNull(),
    /** Couleur en hexadécimal, pour la vue de suivi par statut. */
    color: text("color"),
    position: integer("position").notNull().default(0),
    /** Probabilité indicative de conclure (0–100), NULL = non renseignée. Une affaire peut y déroger (deals.probability). */
    probability: integer("probability"),
    /** NULL = étape intermédiaire ; won/lost = étape terminale du pipeline. */
    outcome: stageOutcomeEnum("outcome"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Deux pipelines de la même organisation peuvent chacun avoir leur
    // étape "nouveau" — l'unicité du slug est PAR PIPELINE (l'index
    // historique par organisation seule est remplacé par la migration).
    uniqueIndex("deal_statuses_org_pipeline_slug_unique").on(
      table.organizationId,
      table.pipelineId,
      table.slug
    ),
    // Cible de la FK composite deals(statusId, organizationId) : un statut
    // assigné à une affaire doit appartenir à la même organisation.
    unique("deal_statuses_id_org_unique").on(table.id, table.organizationId),
    // Cible de la FK composite deals(statusId, pipelineId) : l'étape d'une
    // affaire doit appartenir à SON pipeline — garanti par la base.
    unique("deal_statuses_id_pipeline_unique").on(table.id, table.pipelineId),
    // Une étape appartient à un pipeline de sa propre organisation.
    foreignKey({
      name: "deal_statuses_pipeline_org_fk",
      columns: [table.pipelineId, table.organizationId],
      foreignColumns: [pipelines.id, pipelines.organizationId],
    }).onDelete("cascade"),
    check(
      "deal_statuses_probability_range",
      sql`${table.probability} IS NULL OR (${table.probability} >= 0 AND ${table.probability} <= 100)`
    ),
  ]
);

export type DealStatus = typeof dealStatuses.$inferSelect;
export type NewDealStatus = typeof dealStatuses.$inferInsert;
