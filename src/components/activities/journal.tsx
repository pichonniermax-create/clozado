import Link from "next/link";
import type { ReactNode } from "react";
import {
  Ban,
  Banknote,
  Briefcase,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  Inbox,
  Mail,
  MessageSquare,
  Milestone,
  Phone,
  Route,
  Send,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { autoRuleLabel } from "@/components/tasks/labels";
import { ACTIVITY_TYPES, journalHeadline } from "@/components/activities/labels";
import type { Journal as JournalData, JournalEntry, JournalKind } from "@/db/queries/activities";
import { deleteActivityAction, logActivityAction } from "@/lib/activities/actions";
import { formatDateTime } from "@/lib/format";
import { useTranslations } from "next-intl";

/**
 * Le journal unifié d'une fiche (contact ou affaire) ou de l'organisation
 * (tableau de bord) : une file verticale avec un rail, chaque entrée
 * horodatée et attribuée — appels, emails, rendez-vous, notes, étapes
 * franchies, partages, tâches achevées, dans la même chronologie (la
 * fusion se fait à la lecture, voir src/db/queries/activities.ts).
 *
 * Sur une fiche, la saisie rapide est en tête : on consigne sans quitter
 * l'écran. Seules les interactions saisies à la main se suppriment — le
 * reste est de l'histoire, on ne la récrit pas.
 */
export function Journal({
  journal,
  backTo,
  contactId,
  dealId,
  context,
  erreur,
  title = "Activité",
  description,
  emptyText,
}: {
  journal: JournalData;
  /** Chemin de l'écran — les actions y reviennent. */
  backTo: string;
  contactId?: string;
  dealId?: string;
  /** Où l'on est : les liens vers la fiche affichée sont masqués ; `org` = tableau de bord, tout est lié, rien ne se saisit. */
  context: "contact" | "deal" | "org";
  /** Message d'erreur remonté par une action du journal (paramètre d'URL dédié). */
  erreur?: string;
  title?: string;
  description?: string;
  emptyText?: string;
}) {
  const t = useTranslations("activities.journal");
  const ta = useTranslations("activities");
  const quickEntry = context !== "org";
  const count = journal.entries.length;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {title}
          {count > 0 && ` (${count}${journal.truncated ? "+" : ""})`}
        </h2>
        {journal.truncated && (
          <span className="text-xs text-muted-foreground">{t("les_entrees_les_plus_recentes", { count })}</span>
        )}
      </div>
      {description && <p className="-mt-1 text-xs text-muted-foreground">{description}</p>}

      {erreur && (
        <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">{erreur}</p>
      )}

      {quickEntry && (
        <form
          action={logActivityAction.bind(null, { backTo, contactId, dealId })}
          className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <select
              name="type"
              defaultValue="call"
              aria-label={t("type_d_interaction")}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              {ACTIVITY_TYPES.map((value) => (
                <option key={value} value={value}>
                  {ta(`types.${value}`)}
                </option>
              ))}
            </select>
            <Input
              name="content"
              placeholder={t("ce_qui_s_est_dit_ce_870e")}
              aria-label={t("compte_rendu")}
              className="min-w-56 flex-1"
            />
            <Input name="occurredAt" type="datetime-local" aria-label={t("date_et_heure")} className="w-fit" />
            <Button type="submit" variant="outline">
              {t("consigner")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("date_vide_maintenant_le_journal_consigne_7b91")}
          </p>
        </form>
      )}

      {count === 0 ? (
        <EmptyState>
          {emptyText ??
            t("rien_encore_les_appels_rendez_vous_2f2c")}
        </EmptyState>
      ) : (
        <ol className="flex flex-col">
          {journal.entries.map((entry, index) => (
            <JournalRow
              key={entry.key}
              entry={entry}
              last={index === count - 1}
              context={context}
              backTo={backTo}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

const KIND_ICONS: Record<JournalKind, ReactNode> = {
  call: <Phone />,
  email: <Mail />,
  meeting: <CalendarDays />,
  note: <StickyNote />,
  deal_created: <Briefcase />,
  stage: <Milestone />,
  share_sent: <Send />,
  share_viewed: <Eye />,
  share_accepted: <Check />,
  share_declined: <X />,
  share_revoked: <Ban />,
  share_expired: <Clock />,
  commented: <MessageSquare />,
  commission_updated: <Banknote />,
  origin_changed: <Route />,
  task_done: <CheckCircle2 />,
  lead_received: <Inbox />,
};

function JournalRow({
  entry,
  last,
  context,
  backTo,
}: {
  entry: JournalEntry;
  last: boolean;
  context: "contact" | "deal" | "org";
  backTo: string;
}) {
  const t = useTranslations("activities.journal");
  const ta = useTranslations("activities");
  const tt = useTranslations("tasks");
  const showDeal = entry.dealId && entry.dealTitle && context !== "deal";
  const showContact = entry.contactId && entry.contactName && context !== "contact";
  // Le titre de la tâche est déjà dans l'intitulé (journalHeadline).
  const body = entry.kind === "task_done" ? null : entry.body;

  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span
          aria-hidden
          className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground [&_svg]:size-3.5"
        >
          {KIND_ICONS[entry.kind]}
        </span>
        {!last && <span aria-hidden className="w-px flex-1 bg-border" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 pb-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm font-medium">{journalHeadline(entry, ta)}</p>
          {entry.stage && <StageChange stage={entry.stage} />}
          {entry.autoRule && (
            <Badge variant="secondary">{autoRuleLabel(entry.autoRule, tt)}</Badge>
          )}
          {entry.activityId && (
            <form
              action={deleteActivityAction.bind(null, { backTo, activityId: entry.activityId })}
              className="ml-auto"
            >
              <Button
                type="submit"
                variant="ghost"
                size="icon-sm"
                aria-label={t("supprimer_cette_interaction")}
                title={t("supprimer_cette_interaction")}
              >
                <Trash2 />
              </Button>
            </form>
          )}
        </div>
        {body && <p className="text-sm whitespace-pre-line text-muted-foreground">{body}</p>}
        <p className="text-xs tabular-nums text-muted-foreground">
          {entry.actorLabel ?? t("systeme")} · {formatDateTime(entry.at)}
          {showDeal && (
            <>
              {t.rich("affaire", { dealTitle: (entry.dealTitle) ?? "", link: (chunks) => <Link href={`/affaires/${entry.dealId}`}
                className="font-medium text-foreground underline underline-offset-2">{chunks}</Link> })}
            </>
          )}
          {showContact && (
            <>
              {t.rich("contact", { contactName: (entry.contactName) ?? "", link: (chunks) => <Link href={`/contacts/${entry.contactId}`}
                className="font-medium text-foreground underline underline-offset-2">{chunks}</Link> })}
            </>
          )}
        </p>
      </div>
    </li>
  );
}

/** « Nouveau → Partagée », avec les couleurs des étapes — même code visuel que le temps par étape de la fiche affaire. */
function StageChange({ stage }: { stage: NonNullable<JournalEntry["stage"]> }) {
  const t = useTranslations("activities.journal");
  return (
    <span className="flex flex-wrap items-center gap-1.5 text-sm">
      {stage.fromLabel && (
        <>
          <StageDot color={stage.fromColor} />
          <span>{stage.fromLabel}</span>
          <span aria-hidden className="text-muted-foreground">
            →
          </span>
        </>
      )}
      <StageDot color={stage.toColor} />
      <span>
        {stage.toLabel}
        {stage.outcome === "won" && t("gagnee")}
        {stage.outcome === "lost" && t("perdue")}
      </span>
    </span>
  );
}

function StageDot({ color }: { color: string | null }) {
  return (
    <span
      aria-hidden
      className="size-2 shrink-0 rounded-full"
      style={{ backgroundColor: color ?? "var(--muted-foreground)" }}
    />
  );
}
