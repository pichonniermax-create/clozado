import type { JournalEntry } from "@/db/queries/activities";
import type { TranslatorOf } from "@/i18n/translator";

/** Vocabulaire du journal — les libellés vivent dans les messages (`activities.kinds`, `activities.types`, `activities.headlines`), partagés par les fiches et le tableau de bord. */

/** Paramètre d'URL qui ramène l'erreur d'une action du journal sur la fiche appelante. */
export const JOURNAL_ERROR_PARAM = "erreurJournal";

/** Les interactions qu'on saisit à la main, dans l'ordre du sélecteur. */
export const ACTIVITY_TYPES = ["call", "email", "meeting", "note"] as const;

export type ActivitiesTranslator = TranslatorOf<"activities">;

const WITH_PARTNER = new Set<JournalEntry["kind"]>(["share_sent", "share_viewed", "share_accepted", "share_declined", "share_revoked", "share_expired"]);

/** « Partage envoyé à Cabinet Martin », « Tâche achevée : Rappeler le notaire »… */
export function journalHeadline(entry: JournalEntry, t: ActivitiesTranslator): string {
  if (entry.kind === "task_done" && entry.body) return t("headlines.task_done", { body: entry.body });
  if (entry.kind === "lead_received" && entry.originLabel) return t("headlines.lead_received", { origin: entry.originLabel });
  if (WITH_PARTNER.has(entry.kind) && entry.partnerName) {
    return t(`headlines.${entry.kind as "share_sent" | "share_viewed" | "share_accepted" | "share_declined" | "share_revoked" | "share_expired"}`, { partner: entry.partnerName });
  }
  return t(`kinds.${entry.kind}`);
}
