import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  BellRing,
  BookUser,
  Briefcase,
  Check,
  Flag,
  Handshake,
  ListTodo,
  PauseCircle,
  Plus,
  Sparkles,
} from "lucide-react";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListCard, ListRow, ListRowLink } from "@/components/ui/list-card";
import { PageHeader } from "@/components/app-shell/page-header";
import { StatTile } from "@/components/stat-tile";
import { Journal } from "@/components/activities/journal";
import { TASK_AUTO_RULE_LABELS } from "@/components/tasks/labels";
import { TaskMetaLine } from "@/components/tasks/task-section";
import { listOrganizationJournal } from "@/db/queries/activities";
import { countContacts } from "@/db/queries/contacts";
import { getFollowUpBoard } from "@/db/queries/deal-follow-up";
import { getPipelineSummary } from "@/db/queries/deals";
import { getOwnOrganization, getVisibleOrganizations } from "@/db/queries/organizations";
import { listPartners } from "@/db/queries/partners";
import { generateAutoTasks, getTasksDueSummary } from "@/db/queries/tasks";
import { setActiveOrganizationAction } from "@/lib/admin/actions";
import { completeTaskAction } from "@/lib/tasks/actions";
import { formatDays, formatEuros } from "@/lib/format";
import { requireUser } from "@/lib/session";

/** Tâches montrées sur le tableau de bord — le reste vit sur l'écran des tâches. */
const TASKS_PREVIEW = 6;
/** Entrées d'activité récente. */
const JOURNAL_PREVIEW = 8;

function plural(n: number, singular: string, pluralForm = `${singular}s`) {
  return `${n} ${n > 1 ? pluralForm : singular}`;
}

/**
 * Le tableau de bord agrège les trois modules — tâches, PRM, pipeline et
 * contacts — et n'est plus le seul reflet du PRM. Il annonce ce qui attend
 * et renvoie vers l'écran où l'on travaille ; la seule action possible ici
 * est d'achever une tâche d'un clic (exigence du module tâches : depuis
 * n'importe quelle vue).
 */
export default async function DashboardPage() {
  const user = await requireUser();

  // Le super_admin SANS organisation choisie : aucun chiffre métier ne le
  // concerne, il voit la liste des organisations — et peut entrer dans
  // l'une d'elles (même geste que le bandeau, depuis la liste).
  if (!user.organizationId) {
    async function workIn(formData: FormData) {
      "use server";
      await setActiveOrganizationAction(String(formData.get("orgId")));
      redirect("/dashboard");
    }
    const organizations = await getVisibleOrganizations(user);
    return (
      <>
        <PageHeader
          title="Organisations"
          description="Vue globale super admin — choisis une organisation (ici ou dans le bandeau) pour travailler dedans."
        />
        <ListCard>
          {organizations.map((org) => (
            <ListRow key={org.id}>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{org.name}</span>
                <span className="text-xs text-muted-foreground">{org.slug}</span>
              </span>
              <form action={workIn}>
                <input type="hidden" name="orgId" value={org.id} />
                <button
                  type="submit"
                  className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                >
                  Travailler dans cette organisation
                </button>
              </form>
            </ListRow>
          ))}
        </ListCard>
      </>
    );
  }

  const board = await getFollowUpBoard(user);
  // Comme l'écran des tâches : ouvrir le tableau de bord matérialise en
  // tâches ce que le suivi signale (idempotent, voir generateAutoTasks) —
  // sinon la tuile « À relancer » et la liste « à faire » se contrediraient
  // tant qu'on n'a pas ouvert /taches. Le tableau déjà calculé est réutilisé.
  await generateAutoTasks(user, board);

  const [org, pipeline, contactsCount, partners, tasksDue, journal] = await Promise.all([
    getOwnOrganization(user),
    getPipelineSummary(user),
    countContacts(user),
    listPartners(user),
    getTasksDueSummary(user, TASKS_PREVIEW),
    listOrganizationJournal(user, JOURNAL_PREVIEW),
  ]);

  const unpaidTotal = board.unpaidCommissions.reduce(
    (sum, c) => sum + (Number(c.computedAmount) || 0),
    0
  );
  const activePartners = partners.filter((p) => p.active).length;
  const tasksNow = tasksDue.overdue + tasksDue.today;
  // Un espace neuf : ni contact ni affaire. Des tuiles à zéro ne disent pas
  // par où commencer — on le dit, avec les premiers gestes (les partenaires
  // ne comptent pas : on peut en avoir sans avoir encore rien suivi).
  const isFreshSpace =
    contactsCount === 0 && pipeline.open.n + pipeline.won.n + pipeline.lost.n === 0;

  // Les trois piles d'action, remises bout à bout et tronquées : le tableau
  // de bord annonce ce qui attend, l'écran de suivi est celui où l'on
  // travaille. Pas de bouton d'action ici — un seul endroit pour agir.
  const priority = [
    ...board.pendingAlerts.map((row) => ({
      key: `p-${row.shareId}`,
      dealId: row.dealId,
      title: row.dealTitle,
      partner: row.partnerName,
      detail:
        row.daysUntilExpiry !== null && row.daysUntilExpiry <= board.thresholds.expiringSoonDays
          ? row.daysUntilExpiry <= 0
            ? "lien expiré"
            : `expire dans ${formatDays(row.daysUntilExpiry)}`
          : `sans réponse depuis ${formatDays(row.daysSinceSent)}`,
      critical: row.critical,
    })),
    ...board.acceptedStale.map((row) => ({
      key: `s-${row.shareId}`,
      dealId: row.dealId,
      title: row.dealTitle,
      partner: row.partnerName,
      detail: `acceptée, rien depuis ${formatDays(row.daysSinceActivity)}`,
      critical: false,
    })),
  ].slice(0, 5);

  return (
    <>
      <PageHeader
        title={org?.name ?? "Tableau de bord"}
        description={`${plural(contactsCount, "contact")} · ${plural(pipeline.open.n, "affaire en cours", "affaires en cours")} · ${plural(activePartners, "partenaire actif", "partenaires actifs")}`}
        actions={
          <>
            <Link href="/contacts" className={buttonVariants({ variant: "outline" })}>
              <BookUser />
              Contacts
            </Link>
            <Link href="/affaires" className={buttonVariants()}>
              <Plus />
              Nouvelle affaire
            </Link>
          </>
        }
      />

      {isFreshSpace && (
        <EmptyState
          icon={<Sparkles />}
          title="Bienvenue dans ton espace"
          action={
            <>
              <Link href="/contacts/import" className={buttonVariants()}>
                Importer mes contacts
              </Link>
              {partners.length === 0 && (
                <Link href="/partenaires?nouveau=1" className={buttonVariants({ variant: "outline" })}>
                  Ajouter un partenaire
                </Link>
              )}
              <Link href="/affaires?nouveau=1" className={buttonVariants({ variant: "outline" })}>
                Créer une affaire
              </Link>
            </>
          }
        >
          Par où commencer : importe tes contacts ou crée les premières fiches, puis crée ta
          première affaire — et partage-la à un confrère depuis sa fiche. Le tableau de bord se
          remplit tout seul.
        </EmptyState>
      )}

      {/* Aujourd'hui : ce qui attend une action, tous modules confondus. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="À faire"
          value={tasksNow}
          hint={
            tasksDue.overdue > 0
              ? `dont ${plural(tasksDue.overdue, "en retard")}`
              : "Tâches du jour"
          }
          icon={<ListTodo />}
          tone={tasksDue.overdue > 0 ? "critical" : "warning"}
          href="/taches"
        />
        <StatTile
          label="À relancer"
          value={board.pendingAlerts.length}
          hint="Partages sans réponse"
          icon={<BellRing />}
          tone="critical"
          href="/suivi"
        />
        <StatTile
          label="Sans suite"
          value={board.acceptedStale.length}
          hint="Acceptées, puis silence"
          icon={<PauseCircle />}
          tone="warning"
          href="/suivi"
        />
        <StatTile
          label="À encaisser"
          value={unpaidTotal > 0 ? (formatEuros(unpaidTotal) ?? "—") : "—"}
          hint={`${plural(board.unpaidCommissions.length, "commission confirmée", "commissions confirmées")}`}
          icon={<Banknote />}
          tone="success"
          href="/suivi"
        />
      </div>

      {/* Les dossiers : la matière, pas l'urgence — ton neutre. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Contacts"
          value={contactsCount}
          hint="Personnes et sociétés"
          icon={<BookUser />}
          href="/contacts"
        />
        <StatTile
          label="Affaires en cours"
          value={pipeline.open.n}
          hint={pipeline.open.amount > 0 ? `≈ ${formatEuros(pipeline.open.amount)} au pipeline` : "Dans le pipeline"}
          icon={<Briefcase />}
          href="/affaires"
        />
        <StatTile
          label="Gagnées"
          value={pipeline.won.n}
          hint={pipeline.won.amount > 0 ? `≈ ${formatEuros(pipeline.won.amount)}` : "Affaires conclues"}
          icon={<Flag />}
          tone="success"
          href="/affaires?vue=liste"
        />
        <StatTile
          label="Partages actifs"
          value={board.inProgress.length}
          hint="Rien à faire pour l'instant"
          icon={<Handshake />}
          href="/suivi"
        />
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">À faire aujourd&apos;hui</h2>
          <Link
            href="/taches"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Toutes les tâches
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        {tasksDue.rows.length === 0 ? (
          <EmptyState className="py-8">Rien d&apos;échu ni de prévu pour aujourd&apos;hui.</EmptyState>
        ) : (
          <>
            <ListCard>
              {tasksDue.rows.map((task) => (
                <li key={task.id} className="flex items-center gap-3 px-4 py-3">
                  <form action={completeTaskAction.bind(null, { taskId: task.id, backTo: "/dashboard" })}>
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
                </li>
              ))}
            </ListCard>
            {tasksNow > tasksDue.rows.length && (
              <p className="text-xs text-muted-foreground">
                Et {plural(tasksNow - tasksDue.rows.length, "autre")} —{" "}
                <Link href="/taches" className="underline underline-offset-2 hover:text-foreground">
                  voir toutes les tâches
                </Link>
                .
              </p>
            )}
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">À traiter en priorité</h2>
          <Link
            href="/suivi"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Tout le suivi
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        {priority.length === 0 ? (
          <EmptyState className="py-8">Rien qui attende une relance. Tout est à jour.</EmptyState>
        ) : (
          <ListCard>
            {priority.map((row) => (
              <ListRowLink
                key={row.key}
                href={`/affaires/${row.dealId}`}
                title={row.title}
                subtitle={row.partner}
                chevron={false}
                trailing={
                  <span
                    className={
                      row.critical
                        ? "text-xs font-medium tabular-nums text-destructive"
                        : "text-xs tabular-nums text-muted-foreground"
                    }
                  >
                    {row.detail}
                  </span>
                }
              />
            ))}
          </ListCard>
        )}
      </section>

      <Journal
        journal={journal}
        backTo="/dashboard"
        context="org"
        title="Activité récente"
        description="Interactions, étapes franchies, partages, tâches achevées — toute l'organisation, les plus récentes d'abord."
        emptyText="Rien encore : les appels, rendez-vous et notes se consignent depuis les fiches contact et affaire ; le reste arrive tout seul."
      />
    </>
  );
}
