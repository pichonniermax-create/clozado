import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { commissions } from "./commissions";
import { contacts } from "./contacts";
import { dealShares } from "./deal-shares";
import { deals } from "./deals";
import { organizations } from "./organizations";
import { users } from "./users";

/** Deux états seulement : une tâche est à faire ou faite. L'urgence vient de l'échéance, pas d'un statut. */
export const taskStatusEnum = pgEnum("task_status", ["open", "done"]);

export const taskPriorityEnum = pgEnum("task_priority", ["low", "normal", "high"]);

/**
 * Les trois règles de génération automatique depuis le PRM — le lien entre
 * les modules. Vocabulaire technique fixe : les SEUILS de déclenchement,
 * eux, sont par organisation (colonnes share_pending_reminder_days,
 * deal_accepted_stale_days… de `organizations`).
 */
export const taskAutoRuleEnum = pgEnum("task_auto_rule", [
  "share_pending",
  "deal_accepted_stale",
  "commission_unpaid",
]);

/** Unité de récurrence. L'app matérialise l'occurrence SUIVANTE à l'achèvement — pas de tâche de fond. */
export const taskRecurUnitEnum = pgEnum("task_recur_unit", ["day", "week", "month", "year"]);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    notes: text("notes"),
    /** NULL = sans échéance (n'apparaît ni dans « en retard » ni dans « du jour »). */
    dueAt: timestamp("due_at", { withTimezone: true }),
    priority: taskPriorityEnum("priority").notNull().default("normal"),
    status: taskStatusEnum("status").notNull().default("open"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** Responsable — un utilisateur de l'organisation. */
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    /** Rattachements optionnels : contact, affaire, ou rien. */
    contactId: uuid("contact_id"),
    dealId: uuid("deal_id"),
    // --- Génération automatique (règles PRM) ---
    autoRule: taskAutoRuleEnum("auto_rule"),
    sourceShareId: uuid("source_share_id"),
    sourceCommissionId: uuid("source_commission_id"),
    // --- Récurrence ---
    recurUnit: taskRecurUnitEnum("recur_unit"),
    recurEvery: integer("recur_every"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Une tâche faite porte sa date d'achèvement, une tâche à faire jamais.
    check(
      "tasks_completed_consistency",
      sql`(${table.status} = 'done') = (${table.completedAt} IS NOT NULL)`
    ),
    // Générée ⇔ reliée à sa source PRM (partage ou commission, jamais les deux).
    check(
      "tasks_auto_single_source",
      sql`NOT (${table.sourceShareId} IS NOT NULL AND ${table.sourceCommissionId} IS NOT NULL)`
    ),
    check(
      "tasks_auto_source_consistency",
      sql`(${table.autoRule} IS NULL) = (${table.sourceShareId} IS NULL AND ${table.sourceCommissionId} IS NULL)`
    ),
    // Récurrence : unité et pas vont ensemble, et exigent une échéance
    // (sans échéance, « toutes les 2 semaines » ne veut rien dire).
    check(
      "tasks_recurrence_pair",
      sql`(${table.recurUnit} IS NULL) = (${table.recurEvery} IS NULL)`
    ),
    check(
      "tasks_recurrence_needs_due",
      sql`${table.recurUnit} IS NULL OR ${table.dueAt} IS NOT NULL`
    ),
    check(
      "tasks_recur_every_positive",
      sql`${table.recurEvery} IS NULL OR ${table.recurEvery} >= 1`
    ),
    // Idempotence de la génération : UNE tâche par (règle, source), pour
    // toujours — l'achever signifie « traité », la règle ne renaît pas le
    // lendemain. À rediscuter à l'étape 5 si l'usage montre qu'un rappel
    // doit pouvoir renaître.
    uniqueIndex("tasks_auto_share_unique")
      .on(table.autoRule, table.sourceShareId)
      .where(sql`${table.sourceShareId} IS NOT NULL`),
    uniqueIndex("tasks_auto_commission_unique")
      .on(table.autoRule, table.sourceCommissionId)
      .where(sql`${table.sourceCommissionId} IS NOT NULL`),
    // Isolation garantie par la base sur tous les rattachements.
    foreignKey({
      name: "tasks_contact_org_fk",
      columns: [table.contactId, table.organizationId],
      foreignColumns: [contacts.id, contacts.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "tasks_deal_org_fk",
      columns: [table.dealId, table.organizationId],
      foreignColumns: [deals.id, deals.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "tasks_source_share_org_fk",
      columns: [table.sourceShareId, table.organizationId],
      foreignColumns: [dealShares.id, dealShares.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "tasks_source_commission_org_fk",
      columns: [table.sourceCommissionId, table.organizationId],
      foreignColumns: [commissions.id, commissions.organizationId],
    }).onDelete("cascade"),
    // La vue « aujourd'hui » : ouvertes, triées par échéance.
    index("tasks_org_status_due_idx").on(table.organizationId, table.status, table.dueAt),
    index("tasks_org_assignee_status_idx").on(
      table.organizationId,
      table.assigneeId,
      table.status
    ),
    index("tasks_org_contact_idx").on(table.organizationId, table.contactId),
    index("tasks_org_deal_idx").on(table.organizationId, table.dealId),
  ]
);

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
