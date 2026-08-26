import Link from "next/link";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ListCard } from "@/components/ui/list-card";
import { autoRuleLabel, formatRecurrence, priorityLabel } from "@/components/tasks/labels";
import { todayAsStoredDate, type TaskRow } from "@/db/queries/tasks";
import { completeTaskAction, createTaskFromFicheAction } from "@/lib/tasks/actions";
import { formatDate } from "@/lib/format";
import { useTranslations } from "next-intl";

/**
 * La section « Tâches » des fiches contact et affaire : les tâches ouvertes
 * de la fiche, un geste pour achever, un ajout rapide rattaché à la fiche.
 * Le reste (édition, récurrence, réattribution, achevées) vit sur l'écran
 * des tâches — une fiche montre le travail lié, elle n'est pas le poste de
 * travail.
 */
export function TaskSection({
  tasks,
  backTo,
  contactId,
  dealId,
  emptyText,
  erreur,
}: {
  tasks: TaskRow[];
  /** Chemin de la fiche — les actions y reviennent. */
  backTo: string;
  contactId?: string;
  dealId?: string;
  emptyText: string;
  /** Message d'erreur remonté par une action (paramètre d'URL `erreur`). */
  erreur?: string;
}) {
  const t = useTranslations("tasks.taskSection");
  const tt = useTranslations("tasks");
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {t("taches", { n: (tasks.length > 0 && ` (${tasks.length})`) || "" })}
        </h2>
        <Link
          href="/taches"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("toutes_les_taches")}
        </Link>
      </div>

      {erreur && (
        <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">{erreur}</p>
      )}

      {tasks.length === 0 ? (
        <EmptyState>{emptyText}</EmptyState>
      ) : (
        <ListCard>
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-3 px-4 py-3">
              <form action={completeTaskAction.bind(null, { taskId: task.id, backTo })}>
                <Button
                  type="submit"
                  variant="outline"
                  size="icon-sm"
                  className="rounded-full"
                  aria-label={t("marquer_comme_faite", { title: task.title })}
                  title={t("marquer_comme_faite_bb0d")}
                >
                  <Check />
                </Button>
              </form>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{task.title}</span>
                <TaskMetaLine task={task} hideContactId={contactId} hideDealId={dealId} />
              </div>
              {task.autoRule && (
                <Badge variant="secondary" className="shrink-0">
                  {autoRuleLabel(task.autoRule, tt)}
                </Badge>
              )}
            </li>
          ))}
        </ListCard>
      )}

      <form
        action={createTaskFromFicheAction.bind(null, { backTo, contactId, dealId })}
        className="flex flex-wrap items-center gap-2"
      >
        <Input
          name="title"
          required
          placeholder={t("nouvelle_tache_pour_cette_fiche")}
          aria-label={t("titre_de_la_nouvelle_tache")}
          className="min-w-48 flex-1"
        />
        <Input name="dueDate" type="date" aria-label={t("echeance")} className="w-fit" />
        <Button type="submit" variant="outline">
          {t("ajouter")}
        </Button>
      </form>
    </section>
  );
}

/**
 * La ligne de détail d'une tâche — partagée entre fiches et écran des
 * tâches pour que « en retard », la priorité et la récurrence se disent
 * partout pareil. Les liens vers la fiche affichée sont masqués (se lier
 * soi-même n'apprend rien).
 */
export function TaskMetaLine({
  task,
  hideContactId,
  hideDealId,
}: {
  task: TaskRow;
  hideContactId?: string;
  hideDealId?: string;
}) {
  const t = useTranslations("tasks.taskSection");
  const tt = useTranslations("tasks");
  const overdue = task.status === "open" && task.dueAt !== null && task.dueAt < todayAsStoredDate();
  const showDeal = task.dealId && task.dealTitle && task.dealId !== hideDealId;
  const showContact = task.contactId && task.contactName && task.contactId !== hideContactId;

  return (
    <span className="flex flex-wrap items-center gap-x-1.5 text-xs tabular-nums text-muted-foreground">
      {task.dueAt ? (
        <span className={overdue ? "font-medium text-destructive" : undefined}>
          {overdue ? t("en_retard_echeance_le") : t("echeance_le")}
          {formatDate(task.dueAt)}
        </span>
      ) : (
        <span>{t("sans_echeance")}</span>
      )}
      {task.priority !== "normal" && (
        <span>{t("priorite", { toLowerCase: priorityLabel(task.priority, tt).toLowerCase() })}</span>
      )}
      {task.recurUnit && task.recurEvery && (
        <span>· {formatRecurrence(task.recurUnit, task.recurEvery, tt).toLowerCase()}</span>
      )}
      {task.assigneeLabel && <span>· {task.assigneeLabel}</span>}
      {showDeal && (
        <span>
          {t.rich("affaire", { dealTitle: (task.dealTitle) ?? "", link: (chunks) => <Link href={`/affaires/${task.dealId}`}
            className="font-medium text-foreground underline underline-offset-2">{chunks}</Link> })}
        </span>
      )}
      {showContact && (
        <span>
          {t.rich("contact", { contactName: (task.contactName) ?? "", link: (chunks) => <Link href={`/contacts/${task.contactId}`}
            className="font-medium text-foreground underline underline-offset-2">{chunks}</Link> })}
        </span>
      )}
    </span>
  );
}
