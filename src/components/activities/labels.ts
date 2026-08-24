import type { JournalEntry, JournalKind } from "@/db/queries/activities";

/** Vocabulaire français du journal — une seule définition, partagée par les fiches et le tableau de bord. */

/** Paramètre d'URL qui ramène l'erreur d'une action du journal sur la fiche appelante. */
export const JOURNAL_ERROR_PARAM = "erreurJournal";

/** Les interactions qu'on saisit à la main, dans l'ordre du sélecteur. */
export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  call: "Appel",
  email: "Email",
  meeting: "Rendez-vous",
  note: "Note",
};

export const JOURNAL_KIND_LABELS: Record<JournalKind, string> = {
  call: "Appel",
  email: "Email",
  meeting: "Rendez-vous",
  note: "Note",
  deal_created: "Affaire créée",
  stage: "Changement d'étape",
  share_sent: "Partage envoyé",
  share_viewed: "Partage consulté",
  share_accepted: "Partage accepté",
  share_declined: "Partage refusé",
  share_revoked: "Partage révoqué",
  share_expired: "Partage expiré (constaté)",
  commented: "Commentaire",
  commission_updated: "Commission",
  origin_changed: "Origine de l'affaire",
  task_done: "Tâche achevée",
  lead_received: "Lead reçu",
};

/** Comment le confrère se rattache à l'intitulé d'un événement de partage. */
const PARTNER_LINK: Partial<Record<JournalKind, string>> = {
  share_sent: "à",
  share_viewed: "par",
  share_accepted: "par",
  share_declined: "par",
  share_revoked: "·",
  share_expired: "·",
};

/** « Partage envoyé à Cabinet Martin », « Tâche achevée : Rappeler le notaire »… */
export function journalHeadline(entry: JournalEntry): string {
  const label = JOURNAL_KIND_LABELS[entry.kind] ?? entry.kind;
  if (entry.kind === "task_done" && entry.body) return `${label} : ${entry.body}`;
  if (entry.kind === "lead_received" && entry.originLabel) return `${label} · ${entry.originLabel}`;
  const link = PARTNER_LINK[entry.kind];
  if (link && entry.partnerName) return `${label} ${link} ${entry.partnerName}`;
  return label;
}
