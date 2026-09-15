import Link from "next/link";
import { Check, Pencil, RotateCcw, X } from "lucide-react";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { DetailsCard } from "@/components/ui/details-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ListCard } from "@/components/ui/list-card";
import { SectionHeading } from "@/components/ui/section-heading";
import { PageHeader } from "@/components/app-shell/page-header";
import { Textarea } from "@/components/ui/textarea";
import { CompleteTaskButton } from "@/components/tasks/complete-task-button";
import { autoRuleLabel, TASK_PRIORITIES } from "@/components/tasks/labels";
import { TaskMetaLine } from "@/components/tasks/task-section";
import { listOrgUsers } from "@/db/queries/contacts";
import {
  TASKS_PAGE_SIZE,
  dueDateInputValue,
  generateAutoTasks,
  listTasksBoard,
  type TaskRow,
} from "@/db/queries/tasks";
import {
  createTaskFromBoardAction,
  deleteTaskAction,
  reopenTaskAction,
  updateTaskAction,
} from "@/lib/tasks/actions";
import { getFormats } from "@/i18n/formats";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { NativeSelect } from "@/components/ui/native-select";

type Params = {
  conseiller?: string;
  page?: string;
  erreur?: string;
  /** `?nouveau=1` : le formulaire de création arrive déplié (menu « Nouveau » de l'en-tête). */
  nouveau?: string;
};

type OrgUser = { id: string; name: string | null; email: string | null };

export default async function TasksPage({ searchParams }: { searchParams: Promise<Params> }) {
  const t = await getTranslations("tasks.page");
  const fmt = await getFormats();
  const user = await requireUser();
  const params = await searchParams;

  if (!user.organizationId) {
    return (
      <>
        <PageHeader
          title={t("taches")}
          description={t("ce_qu_il_y_a_a_2dc7")}
        />
        <EmptyState>
          {t("tu_es_en_vue_globale_choisis_3e1f")}
        </EmptyState>
      </>
    );
  }

  // La génération automatique tourne ICI, à la lecture — pas de tâche de
  // fond : ouvrir l'écran des tâches matérialise ce que le suivi signale
  // (idempotent, voir generateAutoTasks).
  await generateAutoTasks(user);

  const page = Number(params.page) > 0 ? Number(params.page) : 1;
  const [board, orgUsers] = await Promise.all([
    listTasksBoard(user, { assigneeId: params.conseiller || undefined, page }),
    listOrgUsers(user),
  ]);

  // L'URL de CET écran, filtres et page compris — les actions y reviennent.
  // L'erreur éventuelle n'y est jamais reconduite : elle se montre une fois.
  const pageHref = (p: number) => {
    const sp = new URLSearchParams();
    if (params.conseiller) sp.set("conseiller", params.conseiller);
    if (p > 1) sp.set("page", String(p));
    const s = sp.toString();
    return `/taches${s ? `?${s}` : ""}`;
  };
  // Une page au-delà de la dernière (tâches achevées entre-temps) ramène à la dernière.
  if (board.page > board.pageCount) redirect(pageHref(board.pageCount));
  const backTo = pageHref(board.page);

  const openCount = board.counts.open;

  return (
    <>
      <PageHeader
        title={t("taches")}
        description={t("ce_qu_il_y_a_a_a973")}
      />


      {orgUsers.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <FilterPill href="/taches" label={t("tout_le_monde")} active={!params.conseiller} />
          {orgUsers.map((u) => (
            <FilterPill
              key={u.id}
              href={`/taches?conseiller=${u.id}`}
              label={u.name || u.email || "—"}
              active={params.conseiller === u.id}
            />
          ))}
        </div>
      )}

      {/* Repliée, comme la création des contacts, affaires et partenaires (audit UI du 2026-09-14) : on consulte la liste bien
          plus souvent qu'on ne crée — le formulaire ouvert repoussait la première tâche en retard sous ~850 px sur mobile. Dépliée
          quand il n'y a rien à faire (l'état vide y envoie) ou depuis le menu « Nouveau » (`?nouveau=1`). */}
      <DetailsCard id="nouvelle-tache" summary={t("nouvelle_tache")} defaultOpen={openCount === 0 || params.nouveau === "1"}>
        <form action={createTaskFromBoardAction.bind(null, { backTo })} className="flex flex-col gap-4">
          <Field label={t("titre")} htmlFor="new-title">
            <Input
              id="new-title"
              name="title"
              required
              placeholder={t("rappeler_le_notaire_preparer_le_dossier")}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t("echeance")} htmlFor="new-dueDate">
              <Input id="new-dueDate" name="dueDate" type="date" />
            </Field>
            <Field label={t("priorite")} htmlFor="new-priority">
              <PrioritySelect id="new-priority" defaultValue="normal" />
            </Field>
            <Field label={t("responsable")} htmlFor="new-assignee">
              <AssigneeSelect id="new-assignee" orgUsers={orgUsers} defaultValue={user.id} />
            </Field>
            <Field
              label={t("recurrence")}
              htmlFor="new-recurUnit"
              hint={t("a_l_achevement_l_occurrence_suivante_b9b7")}
            >
              <RecurrenceFields idPrefix="new" />
            </Field>
          </div>
          <Button type="submit" className="w-full sm:w-fit">
            {t("creer_la_tache")}
          </Button>
        </form>
      </DetailsCard>

      {openCount === 0 ? (
        <EmptyState
          title={t("rien_a_faire_pour_l_instant", { value: params.conseiller ? t("pour_ce_conseiller") : "" })}
          action={
            <a href="#nouvelle-tache" className={buttonVariants({ variant: "outline" })}>
              {t("creer_une_tache")}
            </a>
          }
        >
          {t("les_taches_se_creent_ci_dessus_0d28")}
        </EmptyState>
      ) : (
        <>
          <TaskPile label={t("en_retard")} tasks={board.overdue} total={board.counts.overdue} tone="destructive" {...{ backTo, orgUsers }} />
          <TaskPile label={t("aujourd_hui")} tasks={board.today} total={board.counts.today} {...{ backTo, orgUsers }} />
          <TaskPile label={t("a_venir")} tasks={board.upcoming} total={board.counts.upcoming} {...{ backTo, orgUsers }} />
          <TaskPile label={t("sans_echeance")} tasks={board.noDue} total={board.counts.noDue} {...{ backTo, orgUsers }} />
          {board.pageCount > 1 && (
            <nav className="flex items-center justify-between text-sm" aria-label={t("pages_de_taches")}>
              {board.page > 1 ? (
                <Link href={pageHref(board.page - 1)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  {t("plus_urgentes")}
                </Link>
              ) : (
                <span />
              )}
              <span className="tabular-nums text-muted-foreground">
                {t("page_sur_par_page_les_plus_d00e", { page: board.page, pageCount: board.pageCount, tasksPageSize: TASKS_PAGE_SIZE })}
              </span>
              {board.page < board.pageCount ? (
                <Link href={pageHref(board.page + 1)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  {t("suivantes")}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}

      {board.done.length > 0 && (
        <DetailsCard variant="archive" summary={t("achevees_recemment", { count: board.done.length })} flush>
          <ul className="divide-y divide-border">
            {board.done.map((task) => (
              <li key={task.id} className="flex items-center gap-3 px-4 py-2.5">
                <Check aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm text-muted-foreground line-through">
                    {task.title}
                  </span>
                  {task.completedAt && (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {t("achevee_le", { formatDateTime: fmt.dateTime(task.completedAt), n: (task.assigneeLabel && ` · ${task.assigneeLabel}`) ?? "" })}
                    </span>
                  )}
                </div>
                <form action={reopenTaskAction.bind(null, { taskId: task.id, backTo })}>
                  <Button type="submit" variant="ghost" size="sm" title={t("rouvrir_cette_tache")}>
                    <RotateCcw />
                    {t("rouvrir")}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </DetailsCard>
      )}
    </>
  );
}

function FilterPill({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        // 36 px de haut sous sm (cible tactile), la pastille fine dès sm.
        "inline-flex min-h-9 items-center rounded-full border px-3 py-1.5 text-sm transition-colors sm:min-h-0 sm:py-1",
        active
          ? "border-transparent bg-accent font-medium text-accent-foreground"
          : "border-border text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </Link>
  );
}

function TaskPile({
  label,
  tasks,
  total,
  tone,
  backTo,
  orgUsers,
}: {
  label: string;
  /** Les lignes de la page courante. */
  tasks: TaskRow[];
  /** Le total de la pile, toutes pages confondues. */
  total: number;
  tone?: "destructive";
  backTo: string;
  orgUsers: OrgUser[];
}) {
  const t = useTranslations("tasks.page");
  if (tasks.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <SectionHeading
        title={label}
        count={total}
        description={tasks.length < total ? t("sur_cette_page", { count: tasks.length }) : undefined}
        className={cn(tone === "destructive" && "[&_h2]:text-destructive")}
      />
      <ListCard>
        {tasks.map((task) => (
          <TaskItem key={task.id} task={task} backTo={backTo} orgUsers={orgUsers} />
        ))}
      </ListCard>
    </section>
  );
}

function TaskItem({
  task,
  backTo,
  orgUsers,
}: {
  task: TaskRow;
  backTo: string;
  orgUsers: OrgUser[];
}) {
  const t = useTranslations("tasks.page");
  const tt = useTranslations("tasks");
  return (
    <li className="group/row relative flex flex-col px-4 py-3">
      {/* `pr-10` : la place du crayon, posé en absolu en fin de ligne. */}
      <div className="flex items-center gap-3 pr-10">
        <CompleteTaskButton taskId={task.id} backTo={backTo} title={task.title} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="line-clamp-2 text-sm font-medium sm:line-clamp-1">{task.title}</span>
          <TaskMetaLine task={task} />
        </div>
        {task.autoRule && (
          <Badge variant="secondary" className="shrink-0" title={t("tache_automatique_explication")}>
            {autoRuleLabel(task.autoRule, tt)}
          </Badge>
        )}
      </div>

      {/* L'édition derrière un crayon en fin de ligne (audit UI du 2026-09-14) : avant, une ligne « Modifier… » sous chacune
          des tâches — quatorze fois à l'écran. La rangée reste HORS du <details> : un formulaire et des liens dans un
          <summary> seraient du contenu interactif imbriqué. À la souris, le crayon n'apparaît qu'au survol, au clavier ou
          une fois ouvert ; au doigt, toujours. */}
      <details className="group">
        <summary
          aria-label={t("modifier_la_tache")}
          title={t("modifier_la_tache")}
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon-sm" }),
            "absolute top-2.5 right-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden sm:opacity-0 sm:group-hover/row:opacity-100 sm:group-open:opacity-100 sm:focus-visible:opacity-100"
          )}
        >
          <Pencil aria-hidden className="group-open:hidden" />
          <X aria-hidden className="hidden group-open:block" />
        </summary>
        <div className="mt-3 flex flex-col gap-4 rounded-lg border border-border bg-muted/30 p-4 sm:ml-10">
          {task.notes && task.autoRule && (
            <p className="text-xs text-muted-foreground">{task.notes}</p>
          )}
          <form
            action={updateTaskAction.bind(null, { taskId: task.id, backTo })}
            className="flex flex-col gap-3"
          >
            <Field label={t("titre")} htmlFor={`title-${task.id}`}>
              <Input id={`title-${task.id}`} name="title" defaultValue={task.title} required />
            </Field>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Field label={t("echeance")} htmlFor={`dueDate-${task.id}`}>
                <Input
                  id={`dueDate-${task.id}`}
                  name="dueDate"
                  type="date"
                  defaultValue={dueDateInputValue(task.dueAt)}
                />
              </Field>
              <Field label={t("priorite")} htmlFor={`priority-${task.id}`}>
                <PrioritySelect id={`priority-${task.id}`} defaultValue={task.priority} />
              </Field>
              <Field label={t("responsable")} htmlFor={`assignee-${task.id}`}>
                <AssigneeSelect
                  id={`assignee-${task.id}`}
                  orgUsers={orgUsers}
                  defaultValue={task.assigneeId ?? ""}
                />
              </Field>
              <Field label={t("recurrence")} htmlFor={`recurUnit-${task.id}`}>
                <RecurrenceFields
                  idPrefix={task.id}
                  defaultUnit={task.recurUnit ?? ""}
                  defaultEvery={task.recurEvery ?? 1}
                />
              </Field>
            </div>
            {!task.autoRule && (
              <Field label={t("notes")} htmlFor={`notes-${task.id}`}>
                <Textarea
                  id={`notes-${task.id}`}
                  name="notes"
                  defaultValue={task.notes ?? ""}
                  className="min-h-12"
                />
              </Field>
            )}
            {task.autoRule && <input type="hidden" name="notes" value={task.notes ?? ""} />}
            <Button type="submit" size="sm" className="w-fit">
              {t("enregistrer")}
            </Button>
          </form>
          {!task.autoRule && (
            <form
              action={deleteTaskAction.bind(null, { taskId: task.id, backTo })}
              className="border-t border-border pt-3"
            >
              <Button type="submit" variant="ghost" size="sm" className="text-destructive">
                {t("supprimer_cette_tache")}
              </Button>
            </form>
          )}
        </div>
      </details>
    </li>
  );
}

function PrioritySelect({ id, defaultValue }: { id: string; defaultValue: string }) {
  const tt = useTranslations("tasks");
  return (
    <NativeSelect
      id={id}
      name="priority"
      defaultValue={defaultValue} className="w-auto max-w-full"
    >
      {TASK_PRIORITIES.map((value) => (
        <option key={value} value={value}>
          {tt(`priorities.${value}`)}
        </option>
      ))}
    </NativeSelect>
  );
}

function AssigneeSelect({
  id,
  orgUsers,
  defaultValue,
}: {
  id: string;
  orgUsers: OrgUser[];
  defaultValue: string;
}) {
  const t = useTranslations("tasks.page");
  return (
    <NativeSelect
      id={id}
      name="assigneeId"
      defaultValue={defaultValue} className="w-auto max-w-full"
    >
      <option value="">{t("personne")}</option>
      {orgUsers.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name || u.email}
        </option>
      ))}
    </NativeSelect>
  );
}

/** Unité + pas — deux champs qui vont ensemble (les contraintes en base les lient déjà). */
function RecurrenceFields({
  idPrefix,
  defaultUnit = "",
  defaultEvery = 1,
}: {
  idPrefix: string;
  defaultUnit?: string;
  defaultEvery?: number;
}) {
  const t = useTranslations("tasks.page");
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{t("tous_les")}</span>
      <Input
        id={`${idPrefix}-recurEvery`}
        name="recurEvery"
        type="number"
        min={1}
        step={1}
        defaultValue={defaultEvery}
        aria-label={t("pas_de_recurrence_toutes_les_n_a5aa")}
        className="w-14"
      />
      <NativeSelect
        id={`${idPrefix}-recurUnit`}
        name="recurUnit"
        defaultValue={defaultUnit}
        aria-label={t("unite_de_recurrence")} className="flex-1"
      >
        <option value="">{t("jamais")}</option>
        <option value="day">{t("jours")}</option>
        <option value="week">{t("semaines")}</option>
        <option value="month">{t("mois")}</option>
        <option value="year">{t("ans")}</option>
      </NativeSelect>
    </div>
  );
}
