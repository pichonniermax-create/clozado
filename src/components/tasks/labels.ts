import type { TranslatorOf } from "@/i18n/translator";

/** Vocabulaire du module tâches — les libellés vivent dans les messages (`tasks.priorities`, `tasks.autoRules`, `tasks.recurrence`), partagés par l'écran des tâches et les fiches. */

export const TASK_PRIORITIES = ["low", "normal", "high"] as const;
export const TASK_AUTO_RULES = ["share_pending", "deal_accepted_stale", "commission_unpaid"] as const;
const RECUR_UNITS = ["day", "week", "month", "year"] as const;

export type TasksTranslator = TranslatorOf<"tasks">;

const isPriority = (value: string): value is (typeof TASK_PRIORITIES)[number] => (TASK_PRIORITIES as readonly string[]).includes(value);
const isAutoRule = (value: string): value is (typeof TASK_AUTO_RULES)[number] => (TASK_AUTO_RULES as readonly string[]).includes(value);
const isRecurUnit = (value: string): value is (typeof RECUR_UNITS)[number] => (RECUR_UNITS as readonly string[]).includes(value);

export function priorityLabel(priority: string, t: TasksTranslator): string {
  return isPriority(priority) ? t(`priorities.${priority}`) : priority;
}

/** Une règle inconnue (une colonne plus récente que les messages) s'affiche telle quelle plutôt que de casser l'écran. */
export function autoRuleLabel(rule: string, t: TasksTranslator): string {
  return isAutoRule(rule) ? t(`autoRules.${rule}`) : rule;
}

/** « Chaque semaine », « Tous les 3 mois »… — accords compris, par la langue. */
export function formatRecurrence(unit: string, every: number, t: TasksTranslator): string {
  return isRecurUnit(unit) ? t(`recurrence.${unit}`, { every }) : t("recurrence.other", { every, unit });
}
