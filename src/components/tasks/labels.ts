/** Vocabulaire français du module tâches — une seule définition, partagée par l'écran des tâches et les fiches. */

export const TASK_PRIORITY_LABELS: Record<string, string> = {
  low: "Basse",
  normal: "Normale",
  high: "Haute",
};

export const TASK_AUTO_RULE_LABELS: Record<string, string> = {
  share_pending: "Partage sans réponse",
  deal_accepted_stale: "Affaire sans suite",
  commission_unpaid: "Commission non réglée",
};

const RECUR_EACH: Record<string, string> = {
  day: "Chaque jour",
  week: "Chaque semaine",
  month: "Chaque mois",
  year: "Chaque année",
};

const RECUR_EVERY: Record<string, string> = {
  day: "Tous les %d jours",
  week: "Toutes les %d semaines",
  month: "Tous les %d mois",
  year: "Tous les %d ans",
};

/** « Chaque semaine », « Tous les 3 mois »… — accords français compris. */
export function formatRecurrence(unit: string, every: number): string {
  if (every <= 1) return RECUR_EACH[unit] ?? unit;
  return (RECUR_EVERY[unit] ?? `Tous les %d ${unit}`).replace("%d", String(every));
}
