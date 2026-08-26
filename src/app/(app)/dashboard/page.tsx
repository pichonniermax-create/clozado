import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Banknote, BellRing, BookUser, Check, ListTodo, PauseCircle, Plus, Sparkles } from "lucide-react";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListCard, ListRow, ListRowLink } from "@/components/ui/list-card";
import { SkeletonTiles } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/app-shell/page-header";
import { StatTile } from "@/components/stat-tile";
import { Journal } from "@/components/activities/journal";
import { PackIndicators } from "@/components/dashboard/pack-indicators";
import { autoRuleLabel } from "@/components/tasks/labels";
import { TaskMetaLine } from "@/components/tasks/task-section";
import { listOrganizationJournal } from "@/db/queries/activities";
import { countContacts } from "@/db/queries/contacts";
import { getFollowUpBoard } from "@/db/queries/deal-follow-up";
import { getOwnOrganization, getVisibleOrganizations } from "@/db/queries/organizations";
import { listPartners } from "@/db/queries/partners";
import { generateAutoTasks, getTasksDueSummary } from "@/db/queries/tasks";
import { setActiveOrganizationAction } from "@/lib/admin/actions";
import { completeTaskAction } from "@/lib/tasks/actions";
import { getFormats } from "@/i18n/formats";
import { DASHBOARD_PERIOD, hasAnyDeal, openDeals, parseMetricFilters, PERIOD_PRESETS } from "@/lib/metrics";
import { requireUser } from "@/lib/session";
import { getTranslations } from "next-intl/server";

/** Tâches montrées sur le tableau de bord — le reste vit sur l'écran des tâches. */
const TASKS_PREVIEW = 6;
/** Entrées d'activité récente. */
const JOURNAL_PREVIEW = 8;


/**
 * Le tableau de bord agrège les trois modules — tâches, PRM, pipeline et
 * contacts — et n'est plus le seul reflet du PRM. Il annonce ce qui attend
 * et renvoie vers l'écran où l'on travaille ; la seule action possible ici
 * est d'achever une tâche d'un clic (exigence du module tâches : depuis
 * n'importe quelle vue). Les indicateurs mis en avant viennent du pack
 * métier de l'organisation (module analytique, étape 6), sur la période
 * de l'URL (`periode`, 90 jours sans paramètre) — jamais une liste figée
 * ici.
 */
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ periode?: string }> }) {
  const t = await getTranslations("dashboard.page");
  const tt = await getTranslations("tasks");
  const fmt = await getFormats();
  const user = await requireUser();
  const raw = await searchParams;

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
          title={t("organisations")}
          description={t("vue_globale_super_admin_choisis_une_36d9")}
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
                  className="text-sm font-medium text-primary-ink underline-offset-2 hover:underline"
                >
                  {t("travailler_dans_cette_organisation")}
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

  const [org, open, anyDeal, contactsCount, partners, tasksDue, journal] = await Promise.all([
    getOwnOrganization(user),
    openDeals(user),
    hasAnyDeal(user),
    countContacts(user),
    listPartners(user),
    getTasksDueSummary(user, TASKS_PREVIEW),
    listOrganizationJournal(user, JOURNAL_PREVIEW, await getTranslations("activities.queries")),
  ]);
  // La période des indicateurs : celle de l'URL si c'est un préréglage, sinon celle du tableau de bord (pas celle des écrans analytiques).
  const parsed = parseMetricFilters({ periode: PERIOD_PRESETS.some((p) => p.key === raw.periode) ? raw.periode : DASHBOARD_PERIOD }, fmt.timeZone);

  const unpaidTotal = board.unpaidCommissions.reduce(
    (sum, c) => sum + (Number(c.computedAmount) || 0),
    0
  );
  const activePartners = partners.filter((p) => p.active).length;
  const tasksNow = tasksDue.overdue + tasksDue.today;
  // Un espace neuf : ni contact ni affaire. Des tuiles à zéro ne disent pas
  // par où commencer — on le dit, avec les premiers gestes (les partenaires
  // ne comptent pas : on peut en avoir sans avoir encore rien suivi).
  const isFreshSpace = contactsCount === 0 && !anyDeal;

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
            ? t("lien_expire")
            : t("expire_dans", { formatDays: fmt.days(row.daysUntilExpiry) })
          : t("sans_reponse_depuis", { formatDays: fmt.days(row.daysSinceSent) }),
      critical: row.critical,
    })),
    ...board.acceptedStale.map((row) => ({
      key: `s-${row.shareId}`,
      dealId: row.dealId,
      title: row.dealTitle,
      partner: row.partnerName,
      detail: t("acceptee_rien_depuis", { formatDays: fmt.days(row.daysSinceActivity) }),
      critical: false,
    })),
  ].slice(0, 5);

  return (
    <>
      <PageHeader
        title={org?.name ?? t("tableau_de_bord")}
        description={`${t("contact_contacts", { n: contactsCount })} · ${t("affaire_en_cours_affaires_en_cours", { n: open.n })} · ${t("partenaire_actif_partenaires_actifs", { n: activePartners })}`}
        actions={
          <>
            <Link href="/contacts" className={buttonVariants({ variant: "outline" })}>
              <BookUser />
              {t("contacts")}
            </Link>
            <Link href="/affaires" className={buttonVariants()}>
              <Plus />
              {t("nouvelle_affaire")}
            </Link>
          </>
        }
      />

      {isFreshSpace && (
        <EmptyState
          icon={<Sparkles />}
          title={t("bienvenue_dans_ton_espace")}
          action={
            <>
              <Link href="/contacts/import" className={buttonVariants()}>
                {t("importer_mes_contacts")}
              </Link>
              {partners.length === 0 && (
                <Link href="/partenaires?nouveau=1" className={buttonVariants({ variant: "outline" })}>
                  {t("ajouter_un_partenaire")}
                </Link>
              )}
              <Link href="/affaires?nouveau=1" className={buttonVariants({ variant: "outline" })}>
                {t("creer_une_affaire")}
              </Link>
            </>
          }
        >
          {t("par_ou_commencer_importe_tes_contacts_9cbf")}
        </EmptyState>
      )}

      {/* Aujourd'hui : ce qui attend une action, tous modules confondus. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={t("a_faire")}
          value={tasksNow}
          hint={
            tasksDue.overdue > 0
              ? t("dont_en_retard_en_retards", { overdue: tasksDue.overdue })
              : t("taches_du_jour")
          }
          icon={<ListTodo />}
          tone={tasksDue.overdue > 0 ? "critical" : "warning"}
          href="/taches"
        />
        <StatTile
          label={t("a_relancer")}
          value={board.pendingAlerts.length}
          hint={t("partages_sans_reponse")}
          icon={<BellRing />}
          tone="critical"
          href="/suivi"
        />
        <StatTile
          label={t("sans_suite")}
          value={board.acceptedStale.length}
          hint={t("acceptees_puis_silence")}
          icon={<PauseCircle />}
          tone="warning"
          href="/suivi"
        />
        <StatTile
          label={t("a_encaisser")}
          value={unpaidTotal > 0 ? (fmt.money(unpaidTotal) ?? "—") : "—"}
          hint={`${t("commission_confirmee_commissions_confirmees", { n: board.unpaidCommissions.length })}`}
          icon={<Banknote />}
          tone="success"
          href="/suivi"
        />
      </div>

      {/* Les indicateurs du pack métier : la matière, pas l'urgence — ton neutre. Ils arrivent après le reste (streaming) : l'analytique n'attend pas le travail du jour. */}
      <Suspense fallback={<SkeletonTiles count={8} />}>
        <PackIndicators user={user} businessPack={org?.businessPack ?? null} parsed={parsed} />
      </Suspense>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t("a_faire_aujourd_hui")}</h2>
          <Link
            href="/taches"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("toutes_les_taches")}
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        {tasksDue.rows.length === 0 ? (
          <EmptyState className="py-8">{t("rien_d_echu_ni_de_prevu_3031")}</EmptyState>
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
                      aria-label={t("marquer_comme_faite", { title: task.title })}
                      title={t("marquer_comme_faite_bb0d")}
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
                      {autoRuleLabel(task.autoRule, tt)}
                    </Badge>
                  )}
                </li>
              ))}
            </ListCard>
            {tasksNow > tasksDue.rows.length && (
              <p className="text-xs text-muted-foreground">
                {t.rich("et_autre_autres_voir_toutes_les_bb29", { n: tasksNow - tasksDue.rows.length, link: (chunks) => <Link href="/taches" className="underline underline-offset-2 hover:text-foreground">{chunks}</Link> })}
              </p>
            )}
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t("a_traiter_en_priorite")}</h2>
          <Link
            href="/suivi"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("tout_le_suivi")}
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        {priority.length === 0 ? (
          <EmptyState className="py-8">{t("rien_qui_attende_une_relance_tout_3bf4")}</EmptyState>
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
        title={t("activite_recente")}
        description={t("interactions_etapes_franchies_partages_taches_achevees_b466")}
        emptyText={t("rien_encore_les_appels_rendez_vous_289d")}
      />
    </>
  );
}
