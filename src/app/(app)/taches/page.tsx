import Link from "next/link";
import { Check, RotateCcw } from "lucide-react";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailsCard } from "@/components/ui/details-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ListCard } from "@/components/ui/list-card";
import { PageHeader } from "@/components/app-shell/page-header";
import { Textarea } from "@/components/ui/textarea";
import { TASK_AUTO_RULE_LABELS, TASK_PRIORITY_LABELS } from "@/components/tasks/labels";
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
  completeTaskAction,
  createTaskFromBoardAction,
  deleteTaskAction,
  reopenTaskAction,
  updateTaskAction,
} from "@/lib/tasks/actions";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

type Params = {
  conseiller?: string;
  page?: string;
  erreur?: string;
};

type OrgUser = { id: string; name: string | null; email: string | null };

export default async function TasksPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  const params = await searchParams;

  if (!user.organizationId) {
    return (
      <>
        <PageHeader
          title="Tâches"
          description="Ce qu'il y a à faire — saisi à la main ou généré depuis le suivi des partages."
        />
        <EmptyState>
          Tu es en vue globale : choisis une organisation dans le bandeau super admin en haut de
          l&apos;écran pour voir ses tâches.
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
        title="Tâches"
        description="Ce qu'il y a à faire, trié par échéance. Les relances du PRM arrivent ici toutes seules : partage sans réponse, affaire sans suite, commission non réglée — les achever vaut « traité »."
      />

      {params.erreur && (
        <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">
          {params.erreur}
        </p>
      )}

      {orgUsers.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterPill href="/taches" label="Tout le monde" active={!params.conseiller} />
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

      <Card id="nouvelle-tache">
        <CardHeader>
          <CardTitle>Nouvelle tâche</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createTaskFromBoardAction.bind(null, { backTo })} className="flex flex-col gap-4">
            <Field label="Titre" htmlFor="new-title">
              <Input
                id="new-title"
                name="title"
                required
                placeholder="Rappeler le notaire, préparer le dossier…"
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Échéance" htmlFor="new-dueDate">
                <Input id="new-dueDate" name="dueDate" type="date" />
              </Field>
              <Field label="Priorité" htmlFor="new-priority">
                <PrioritySelect id="new-priority" defaultValue="normal" />
              </Field>
              <Field label="Responsable" htmlFor="new-assignee">
                <AssigneeSelect id="new-assignee" orgUsers={orgUsers} defaultValue={user.id} />
              </Field>
              <Field
                label="Récurrence"
                htmlFor="new-recurUnit"
                hint="À l'achèvement, l'occurrence suivante se crée toute seule. Exige une échéance."
              >
                <RecurrenceFields idPrefix="new" />
              </Field>
            </div>
            <Button type="submit" className="w-fit">
              Créer la tâche
            </Button>
          </form>
        </CardContent>
      </Card>

      {openCount === 0 ? (
        <EmptyState
          title={`Rien à faire pour l'instant${params.conseiller ? " pour ce conseiller" : ""}`}
          action={
            <a href="#nouvelle-tache" className={buttonVariants({ variant: "outline" })}>
              Créer une tâche
            </a>
          }
        >
          Les tâches se créent ci-dessus, ou naissent toutes seules des relances du PRM : partage
          sans réponse, affaire sans suite, commission non réglée.
        </EmptyState>
      ) : (
        <>
          <TaskPile label="En retard" tasks={board.overdue} total={board.counts.overdue} tone="destructive" {...{ backTo, orgUsers }} />
          <TaskPile label="Aujourd'hui" tasks={board.today} total={board.counts.today} {...{ backTo, orgUsers }} />
          <TaskPile label="À venir" tasks={board.upcoming} total={board.counts.upcoming} {...{ backTo, orgUsers }} />
          <TaskPile label="Sans échéance" tasks={board.noDue} total={board.counts.noDue} {...{ backTo, orgUsers }} />
          {board.pageCount > 1 && (
            <nav className="flex items-center justify-between text-sm" aria-label="Pages de tâches">
              {board.page > 1 ? (
                <Link href={pageHref(board.page - 1)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  ← Plus urgentes
                </Link>
              ) : (
                <span />
              )}
              <span className="tabular-nums text-muted-foreground">
                Page {board.page} sur {board.pageCount} · {TASKS_PAGE_SIZE} par page, les plus urgentes d&apos;abord
              </span>
              {board.page < board.pageCount ? (
                <Link href={pageHref(board.page + 1)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  Suivantes →
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}

      {board.done.length > 0 && (
        <DetailsCard variant="archive" summary={`Achevées récemment (${board.done.length})`} flush>
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
                      Achevée le {formatDateTime(task.completedAt)}
                      {task.assigneeLabel && ` · ${task.assigneeLabel}`}
                    </span>
                  )}
                </div>
                <form action={reopenTaskAction.bind(null, { taskId: task.id, backTo })}>
                  <Button type="submit" variant="ghost" size="sm" title="Rouvrir cette tâche">
                    <RotateCcw />
                    Rouvrir
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
        "rounded-full border px-3 py-1 text-sm transition-colors",
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
  if (tasks.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className={cn("text-sm font-semibold", tone === "destructive" && "text-destructive")}>
        {label} ({total})
        {tasks.length < total && (
          <span className="font-normal text-muted-foreground"> · {tasks.length} sur cette page</span>
        )}
      </h2>
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
  return (
    <li className="flex flex-col px-4 py-3">
      <div className="flex items-center gap-3">
        <form action={completeTaskAction.bind(null, { taskId: task.id, backTo })}>
          <Button
            type="submit"
            variant="outline"
            size="icon-sm"
            className="rounded-full"
            aria-label={`Marquer « ${task.title} » comme faite`}
            title="Marquer comme faite"
          >
            <Check />
          </Button>
        </form>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">{task.title}</span>
          <TaskMetaLine task={task} />
        </div>
        {task.autoRule && (
          <Badge variant="secondary" className="shrink-0">
            {TASK_AUTO_RULE_LABELS[task.autoRule] ?? task.autoRule}
          </Badge>
        )}
      </div>

      <details className="group mt-1 pl-10">
        <summary className="w-fit cursor-pointer list-none text-xs text-muted-foreground transition-colors hover:text-foreground">
          <span className="group-open:hidden">Modifier…</span>
          <span className="hidden group-open:inline">Refermer</span>
        </summary>
        <div className="mt-3 flex flex-col gap-4 rounded-lg border border-border bg-muted/30 p-4">
          {task.notes && task.autoRule && (
            <p className="text-xs text-muted-foreground">{task.notes}</p>
          )}
          <form
            action={updateTaskAction.bind(null, { taskId: task.id, backTo })}
            className="flex flex-col gap-3"
          >
            <Field label="Titre" htmlFor={`title-${task.id}`}>
              <Input id={`title-${task.id}`} name="title" defaultValue={task.title} required />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Échéance" htmlFor={`dueDate-${task.id}`}>
                <Input
                  id={`dueDate-${task.id}`}
                  name="dueDate"
                  type="date"
                  defaultValue={dueDateInputValue(task.dueAt)}
                />
              </Field>
              <Field label="Priorité" htmlFor={`priority-${task.id}`}>
                <PrioritySelect id={`priority-${task.id}`} defaultValue={task.priority} />
              </Field>
              <Field label="Responsable" htmlFor={`assignee-${task.id}`}>
                <AssigneeSelect
                  id={`assignee-${task.id}`}
                  orgUsers={orgUsers}
                  defaultValue={task.assigneeId ?? ""}
                />
              </Field>
              <Field label="Récurrence" htmlFor={`recurUnit-${task.id}`}>
                <RecurrenceFields
                  idPrefix={task.id}
                  defaultUnit={task.recurUnit ?? ""}
                  defaultEvery={task.recurEvery ?? 1}
                />
              </Field>
            </div>
            {!task.autoRule && (
              <Field label="Notes" htmlFor={`notes-${task.id}`}>
                <Textarea
                  id={`notes-${task.id}`}
                  name="notes"
                  defaultValue={task.notes ?? ""}
                  className="min-h-12"
                />
              </Field>
            )}
            {task.autoRule && <input type="hidden" name="notes" value={task.notes ?? ""} />}
            <Button type="submit" variant="outline" size="sm" className="w-fit">
              Enregistrer
            </Button>
          </form>
          {!task.autoRule && (
            <form
              action={deleteTaskAction.bind(null, { taskId: task.id, backTo })}
              className="border-t border-border pt-3"
            >
              <Button type="submit" variant="ghost" size="sm" className="text-destructive">
                Supprimer cette tâche
              </Button>
            </form>
          )}
        </div>
      </details>
    </li>
  );
}

function PrioritySelect({ id, defaultValue }: { id: string; defaultValue: string }) {
  return (
    <select
      id={id}
      name="priority"
      defaultValue={defaultValue}
      className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
    >
      {Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </select>
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
  return (
    <select
      id={id}
      name="assigneeId"
      defaultValue={defaultValue}
      className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
    >
      <option value="">Personne</option>
      {orgUsers.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name || u.email}
        </option>
      ))}
    </select>
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
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">tous les</span>
      <Input
        id={`${idPrefix}-recurEvery`}
        name="recurEvery"
        type="number"
        min={1}
        step={1}
        defaultValue={defaultEvery}
        aria-label="Pas de récurrence (toutes les N unités)"
        className="w-14"
      />
      <select
        id={`${idPrefix}-recurUnit`}
        name="recurUnit"
        defaultValue={defaultUnit}
        aria-label="Unité de récurrence"
        className="h-8 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm"
      >
        <option value="">— jamais</option>
        <option value="day">jours</option>
        <option value="week">semaines</option>
        <option value="month">mois</option>
        <option value="year">ans</option>
      </select>
    </div>
  );
}
