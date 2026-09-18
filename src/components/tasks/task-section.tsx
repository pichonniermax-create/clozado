import { use } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ListCard } from "@/components/ui/list-card";
import { SectionHeading } from "@/components/ui/section-heading";
import { CompleteTaskButton } from "@/components/tasks/complete-task-button";
import { autoRuleLabel, formatRecurrence, priorityLabel } from "@/components/tasks/labels";
import { todayAsStoredDate, type TaskRow } from "@/db/queries/tasks";
import { createTaskFromFicheAction } from "@/lib/tasks/actions";
import { getFormats } from "@/i18n/formats";
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
  partnerId,
  showAdd = true,
  emptyText,
}: {
  tasks: TaskRow[];
  /** Chemin de la fiche — les actions y reviennent. */
  backTo: string;
  contactId?: string;
  dealId?: string;
  /** Fiche d'un confrère (lot 3) : le lien vers lui est masqué, se lier soi-même n'apprend rien. */
  partnerId?: string;
  /**
   * L'ajout rapide. Absent sur la fiche d'un confrère : la base n'accepte un
   * confrère comme sujet de tâche QUE pour une tâche générée (une source
   * exige une règle) — offrir un champ qui ne pourrait rien rattacher
   * mentirait. Ce qu'on se promet avec un confrère se consigne dans son
   * journal ; la tâche qui le vise vraiment est celle de la veille.
   */
  showAdd?: boolean;
  emptyText: string;
}) {
  const t = useTranslations("tasks.taskSection");
  const tt = useTranslations("tasks");
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading
        title={t("taches")}
        count={tasks.length > 0 ? tasks.length : undefined}
        trailing={
          <Link href="/taches" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            {t("toutes_les_taches")}
            <ArrowRight />
          </Link>
        }
      />

      {tasks.length === 0 ? (
        <EmptyState>{emptyText}</EmptyState>
      ) : (
        <ListCard>
          {tasks.map((task) => (
            <li key={task.id} className="flex items-center gap-3 px-4 py-3">
              <CompleteTaskButton taskId={task.id} backTo={backTo} title={task.title} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium break-words">{task.title}</span>
                <TaskMetaLine task={task} hideContactId={contactId} hideDealId={dealId} hidePartnerId={partnerId} />
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

      {/* Une colonne sous sm (les trois contrôles se repliaient en escalier à 390 px), une ligne dès sm. */}
      {showAdd && (
      <form
        action={createTaskFromFicheAction.bind(null, { backTo, contactId, dealId })}
        className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center"
      >
        <Input
          name="title"
          required
          placeholder={t("nouvelle_tache_pour_cette_fiche")}
          aria-label={t("titre_de_la_nouvelle_tache")}
          className="sm:min-w-48 sm:flex-1"
        />
        <Input name="dueDate" type="date" aria-label={t("echeance")} className="w-full sm:w-fit" />
        <Button type="submit" variant="outline" className="w-full sm:w-auto">
          {t("ajouter")}
        </Button>
      </form>
      )}
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
  hidePartnerId,
}: {
  task: TaskRow;
  hideContactId?: string;
  hideDealId?: string;
  hidePartnerId?: string;
}) {
  const t = useTranslations("tasks.taskSection");
  const tt = useTranslations("tasks");
  const fmt = use(getFormats());
  const overdue = task.status === "open" && task.dueAt !== null && task.dueAt < todayAsStoredDate(fmt.timeZone);
  const showDeal = task.dealId && task.dealTitle && task.dealId !== hideDealId;
  const showContact = task.contactId && task.contactName && task.contactId !== hideContactId;
  // Le confrère d'une tâche générée (lot 3) : dit et cliquable, comme le contact et l'affaire.
  const showPartner = task.partnerId && task.partnerName && task.partnerId !== hidePartnerId;

  // Les séparateurs « · » sont posés en CSS APRÈS chaque segment sauf le dernier (audit UI du 2026-09-14) : portés par le
  // segment suivant, ils ouvraient chaque retour à la ligne par un point médian orphelin sur mobile.
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 text-xs tabular-nums text-muted-foreground [&>*:not(:last-child)]:after:ml-1.5 [&>*:not(:last-child)]:after:content-['·']">
      {task.dueAt ? (
        <span className={overdue ? "font-medium text-destructive" : undefined}>
          {overdue ? t("en_retard_echeance_le") : t("echeance_le")}{" "}
          {fmt.date(task.dueAt)}
        </span>
      ) : (
        <span>{t("sans_echeance")}</span>
      )}
      {task.priority !== "normal" && (
        <span>{t("priorite", { toLowerCase: priorityLabel(task.priority, tt).toLowerCase() })}</span>
      )}
      {task.recurUnit && task.recurEvery && (
        <span>{formatRecurrence(task.recurUnit, task.recurEvery, tt).toLowerCase()}</span>
      )}
      {task.assigneeLabel && <span>{task.assigneeLabel}</span>}
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
      {showPartner && (
        <span>
          {t.rich("confrere", { partnerName: (task.partnerName) ?? "", link: (chunks) => <Link href={`/partenaires/${task.partnerId}`}
            className="font-medium text-foreground underline underline-offset-2">{chunks}</Link> })}
        </span>
      )}
    </span>
  );
}
