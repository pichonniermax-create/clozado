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
  Mail,
  MessageSquare,
  Milestone,
  Phone,
  Send,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { TASK_AUTO_RULE_LABELS } from "@/components/tasks/labels";
import { ACTIVITY_TYPE_LABELS, journalHeadline } from "@/components/activities/labels";
import type { Journal as JournalData, JournalEntry, JournalKind } from "@/db/queries/activities";
import { deleteActivityAction, logActivityAction } from "@/lib/activities/actions";
import { formatDateTime } from "@/lib/format";

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
          <span className="text-xs text-muted-foreground">Les {count} entrées les plus récentes</span>
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
              aria-label="Type d'interaction"
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              {Object.entries(ACTIVITY_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <Input
              name="content"
              placeholder="Ce qui s'est dit, ce qui a été convenu…"
              aria-label="Compte rendu"
              className="min-w-56 flex-1"
            />
            <Input name="occurredAt" type="datetime-local" aria-label="Date et heure" className="w-fit" />
            <Button type="submit" variant="outline">
              Consigner
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Date vide = maintenant. Le journal consigne ce qui a eu lieu — pour un rendez-vous à venir,
            crée une tâche.
          </p>
        </form>
      )}

      {count === 0 ? (
        <EmptyState>
          {emptyText ??
            "Rien encore. Les appels, rendez-vous et notes se consignent ci-dessus ; les étapes, partages et tâches achevées arrivent tout seuls."}
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
  task_done: <CheckCircle2 />,
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
          <p className="text-sm font-medium">{journalHeadline(entry)}</p>
          {entry.stage && <StageChange stage={entry.stage} />}
          {entry.autoRule && (
            <Badge variant="secondary">{TASK_AUTO_RULE_LABELS[entry.autoRule] ?? entry.autoRule}</Badge>
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
                aria-label="Supprimer cette interaction"
                title="Supprimer cette interaction"
              >
                <Trash2 />
              </Button>
            </form>
          )}
        </div>
        {body && <p className="text-sm whitespace-pre-line text-muted-foreground">{body}</p>}
        <p className="text-xs tabular-nums text-muted-foreground">
          {entry.actorLabel ?? "Système"} · {formatDateTime(entry.at)}
          {showDeal && (
            <>
              {" · affaire "}
              <Link
                href={`/affaires/${entry.dealId}`}
                className="font-medium text-foreground underline underline-offset-2"
              >
                {entry.dealTitle}
              </Link>
            </>
          )}
          {showContact && (
            <>
              {" · contact "}
              <Link
                href={`/contacts/${entry.contactId}`}
                className="font-medium text-foreground underline underline-offset-2"
              >
                {entry.contactName}
              </Link>
            </>
          )}
        </p>
      </div>
    </li>
  );
}

/** « Nouveau → Partagée », avec les couleurs des étapes — même code visuel que le temps par étape de la fiche affaire. */
function StageChange({ stage }: { stage: NonNullable<JournalEntry["stage"]> }) {
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
        {stage.outcome === "won" && " (gagnée)"}
        {stage.outcome === "lost" && " (perdue)"}
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
