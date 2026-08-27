import { sql } from "drizzle-orm";
import { boolean, check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * LE MOTEUR DE RÈGLES (chantier engagement, Partie 3, migration 0016).
 * Une règle = un DÉCLENCHEUR (`trigger` + `threshold_days`), des
 * CONDITIONS (`conditions`, JSON validé par zod et compilé en SQL par une
 * seule fonction, comme les critères d'un segment) et UNE action. Pas
 * d'arbre, pas de branches : une liste de phrases.
 *
 * Une règle ne se supprime jamais : elle se désactive (`enabled`) ou
 * s'archive (`archived_at`) — le journal (`rule_actions`), les tâches et
 * les emails qui la citent restent justes.
 *
 * L'envoi automatique est un OPT-IN par règle : `auto_send_confirmed_at`
 * (et par qui) est exigé par la base pour l'action `send_email`. Le
 * gabarit est figé par versions dans `rule_templates` (la version courante
 * = la plus haute) ; le journal cite la version utilisée.
 */
export const rules = pgTable(
  "rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    trigger: text("trigger").notNull(),
    thresholdDays: integer("threshold_days").notNull(),
    conditions: jsonb("conditions").notNull().default({}),
    action: text("action").notNull(),
    autoSendConfirmedAt: timestamp("auto_send_confirmed_at", { withTimezone: true }),
    autoSendConfirmedBy: uuid("auto_send_confirmed_by").references(() => users.id, { onDelete: "set null" }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    position: integer("position").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("rules_id_org_unique").on(table.id, table.organizationId),
    check(
      "rules_trigger_check",
      sql`${table.trigger} IN ('no_appointment', 'no_interaction', 'email_not_opened', 'email_not_clicked', 'share_unanswered')`
    ),
    check("rules_action_check", sql`${table.action} IN ('create_task', 'notify_owner', 'prepare_draft', 'send_email')`),
    check("rules_threshold_check", sql`${table.thresholdDays} >= 1 AND ${table.thresholdDays} <= 365`),
    // L'envoi automatique n'est jamais un défaut : la base exige l'opt-in explicite.
    check("rules_auto_send_optin_check", sql`${table.action} <> 'send_email' OR ${table.autoSendConfirmedAt} IS NOT NULL`),
    index("rules_org_enabled_idx").on(table.organizationId, table.enabled),
  ]
);

/**
 * LES VERSIONS FIGÉES du gabarit d'une règle : jamais mises à jour, une
 * modification = une version de plus. Les variables du corps sont limitées
 * à une liste sûre (`src/lib/rules/template.ts`), validée à l'écriture.
 */
export const ruleTemplates = pgTable(
  "rule_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ruleId: uuid("rule_id").notNull(),
    version: integer("version").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("rule_templates_id_org_unique").on(table.id, table.organizationId),
    uniqueIndex("rule_templates_rule_version_unique").on(table.ruleId, table.version),
    foreignKey({
      name: "rule_templates_rule_org_fk",
      columns: [table.ruleId, table.organizationId],
      foreignColumns: [rules.id, rules.organizationId],
    }).onDelete("cascade"),
  ]
);

/**
 * Le journal des ÉVALUATIONS : une ligne par passage (cron horaire ou
 * bouton), par organisation ; une évaluation ouverte verrouille le départ
 * d'une autre — garanti par la base, comme `watch_runs`.
 */
export const ruleRuns = pgTable(
  "rule_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    trigger: text("trigger").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    evaluated: integer("evaluated").notNull().default(0),
    matched: integer("matched").notNull().default(0),
    actionsDone: integer("actions_done").notNull().default(0),
    actionsSkipped: integer("actions_skipped").notNull().default(0),
    error: text("error"),
  },
  (table) => [
    unique("rule_runs_id_org_unique").on(table.id, table.organizationId),
    uniqueIndex("rule_runs_org_open_unique")
      .on(table.organizationId)
      .where(sql`${table.finishedAt} IS NULL`),
    check("rule_runs_trigger_check", sql`${table.trigger} IN ('cron', 'manual')`),
    index("rule_runs_org_started_idx").on(table.organizationId, table.startedAt),
  ]
);

/**
 * LE JOURNAL COMPLET des règles : quelle règle, quel contact, quelle action,
 * quand, avec quel gabarit — faite (`done`) ou non faite et pourquoi
 * (`skipped` : plafond atteint, hors fenêtre, contact arrêté, interrupteur
 * coupé, adresse supprimée, sans adresse, sans responsable…). C'est aussi
 * la mémoire anti-répétition : une règle n'agit qu'une fois par contact
 * par période de seuil. `task_id` et `message_id` sont des références
 * souples (une tâche peut être supprimée par une personne ; un message ne
 * disparaît qu'avec l'organisation) — le cycle d'imports entre schémas
 * interdit la FK, l'isolation est vérifiée par le code.
 */
export const ruleActions = pgTable(
  "rule_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    runId: uuid("run_id"),
    ruleId: uuid("rule_id").notNull(),
    contactId: uuid("contact_id").notNull(),
    action: text("action").notNull(),
    outcome: text("outcome").notNull(),
    skipReason: text("skip_reason"),
    taskId: uuid("task_id"),
    messageId: uuid("message_id"),
    templateId: uuid("template_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "rule_actions_run_org_fk",
      columns: [table.runId, table.organizationId],
      foreignColumns: [ruleRuns.id, ruleRuns.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "rule_actions_rule_org_fk",
      columns: [table.ruleId, table.organizationId],
      foreignColumns: [rules.id, rules.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "rule_actions_contact_org_fk",
      columns: [table.contactId, table.organizationId],
      foreignColumns: [contacts.id, contacts.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "rule_actions_template_org_fk",
      columns: [table.templateId, table.organizationId],
      foreignColumns: [ruleTemplates.id, ruleTemplates.organizationId],
    }),
    check("rule_actions_action_check", sql`${table.action} IN ('create_task', 'notify_owner', 'prepare_draft', 'send_email')`),
    check("rule_actions_outcome_check", sql`${table.outcome} IN ('done', 'skipped')`),
    index("rule_actions_org_contact_occurred_idx").on(table.organizationId, table.contactId, table.occurredAt),
    index("rule_actions_org_rule_occurred_idx").on(table.organizationId, table.ruleId, table.occurredAt),
  ]
);

export type Rule = typeof rules.$inferSelect;
export type NewRule = typeof rules.$inferInsert;
export type RuleTemplate = typeof ruleTemplates.$inferSelect;
export type RuleRun = typeof ruleRuns.$inferSelect;
export type RuleAction = typeof ruleActions.$inferSelect;
