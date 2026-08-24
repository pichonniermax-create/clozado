import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { dealStatuses } from "./deal-statuses";
import { dealTypes } from "./deal-types";
import { leads } from "./leads";
import { lossReasons } from "./loss-reasons";
import { organizations } from "./organizations";
import { pipelines } from "./pipelines";
import { users } from "./users";

/**
 * Une affaire appartient TOUJOURS à l'organisation qui l'a créée — jamais
 * transférée. Ce que le partage fait sortir, c'est une vue limitée sur
 * cette affaire via un jeton (`deal_shares`), jamais l'affaire elle-même ni
 * sa ligne en base.
 *
 * Depuis le module relationnel (décision A, docs/module-relationnel.md),
 * l'affaire est AUSSI la carte du pipeline : même ligne, deux angles. Les
 * champs pipeline ci-dessous sont NULL-ables sauf `pipeline_id` (chaque
 * affaire vit dans un pipeline ; les affaires antérieures ont été
 * rattachées au pipeline par défaut de leur organisation à la migration).
 */
export const deals = pgTable(
  "deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /**
     * Libellé client affiché — notamment au partenaire via la vitrine PRM.
     * Quand `contact_id` est posé, c'est une copie du nom du contact au
     * moment du lien (récrite « Client supprimé » par la pierre tombale).
     */
    clientName: text("client_name").notNull(),
    /** Fiche contact liée — NULL pour les affaires d'avant le module relationnel ou saisies sans fiche. */
    contactId: uuid("contact_id"),
    /**
     * L'ORIGINE de l'affaire : le lead qui l'a générée. Posé à la création
     * depuis le lead le plus récent du contact REÇU AVANT la création ;
     * jamais rattaché automatiquement après coup (un lead postérieur n'a
     * pas généré l'affaire) ; modifiable à la main sur la fiche, chaque
     * changement journalisé (`origin_changed`). NULL = origine inconnue.
     */
    leadId: uuid("lead_id"),
    /** Pas de colonne .references() simple ici : voir la FK composite ci-dessous (deals_type_org_fk). */
    typeId: uuid("type_id").notNull(),
    pipelineId: uuid("pipeline_id").notNull(),
    statusId: uuid("status_id").notNull(),
    /** Montant estimé de l'affaire, en euros. */
    estimatedAmount: numeric("estimated_amount", { precision: 12, scale: 2 }),
    /** Dérogation à la probabilité de l'étape (0–100). NULL = celle de l'étape. */
    probability: numeric("probability", { precision: 5, scale: 2 }),
    /** Date de clôture attendue, pour trier/filtrer le pipeline. */
    expectedCloseDate: date("expected_close_date"),
    /** Conseiller responsable de l'affaire (distinct de created_by, qui ne change jamais). */
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    /** Motif de perte — posé quand l'affaire entre dans une étape `outcome = 'lost'`. */
    lossReasonId: uuid("loss_reason_id"),
    description: text("description"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Cible des FK composites des tables filles (deal_shares, commissions,
    // deal_events, tasks, activities…) : garantit par la base, pas par
    // convention, qu'une ligne fille ne peut jamais porter un
    // organization_id différent de celui de l'affaire qu'elle référence.
    unique("deals_id_org_unique").on(table.id, table.organizationId),
    // Un type/statut/pipeline/contact/motif ne peut être assigné à une
    // affaire QUE s'il appartient à la même organisation — sans ces FK
    // composites, un id d'une autre organisation serait techniquement
    // possible ; ce n'est pas qu'une question de cohérence, c'est une
    // fuite possible (deviner/énumérer des labels d'une autre organisation).
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
    foreignKey({
      name: "deals_pipeline_org_fk",
      columns: [table.pipelineId, table.organizationId],
      foreignColumns: [pipelines.id, pipelines.organizationId],
    }),
    // L'étape d'une affaire appartient à SON pipeline (pas seulement à son
    // organisation) — changer une affaire de pipeline impose de choisir une
    // étape du nouveau pipeline dans le même geste.
    foreignKey({
      name: "deals_status_pipeline_fk",
      columns: [table.statusId, table.pipelineId],
      foreignColumns: [dealStatuses.id, dealStatuses.pipelineId],
    }),
    foreignKey({
      name: "deals_contact_org_fk",
      columns: [table.contactId, table.organizationId],
      foreignColumns: [contacts.id, contacts.organizationId],
    }),
    foreignKey({
      name: "deals_loss_reason_org_fk",
      columns: [table.lossReasonId, table.organizationId],
      foreignColumns: [lossReasons.id, lossReasons.organizationId],
    }),
    foreignKey({
      name: "deals_lead_org_fk",
      columns: [table.leadId, table.organizationId],
      foreignColumns: [leads.id, leads.organizationId],
    }).onDelete("set null"),
    check(
      "deals_probability_range",
      sql`${table.probability} IS NULL OR (${table.probability} >= 0 AND ${table.probability} <= 100)`
    ),
    // Kanban : les cartes d'un pipeline, groupées par étape.
    index("deals_org_pipeline_status_idx").on(
      table.organizationId,
      table.pipelineId,
      table.statusId
    ),
    // Liste : filtres et tris annoncés (responsable, clôture prévue, contact).
    index("deals_org_owner_idx").on(table.organizationId, table.ownerId),
    index("deals_org_close_date_idx").on(table.organizationId, table.expectedCloseDate),
    index("deals_org_contact_idx").on(table.organizationId, table.contactId),
    // Analytique : créations d'affaires dans le temps (funnel, délais), et par origine.
    index("deals_org_created_idx").on(table.organizationId, table.createdAt),
    index("deals_org_lead_idx").on(table.organizationId, table.leadId),
  ]
);

export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;
