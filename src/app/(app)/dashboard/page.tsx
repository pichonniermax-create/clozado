import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Banknote, BellRing, BookUser, ListTodo, MailPlus, PauseCircle, Plus, Sparkles } from "lucide-react";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DetailsCard } from "@/components/ui/details-card";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListCard, ListRow, ListRowLink } from "@/components/ui/list-card";
import { SectionHeading } from "@/components/ui/section-heading";
import { SkeletonTiles } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/app-shell/page-header";
import { StatTile } from "@/components/stat-tile";
import { Journal } from "@/components/activities/journal";
import { PackIndicators } from "@/components/dashboard/pack-indicators";
import { CompleteTaskButton } from "@/components/tasks/complete-task-button";
import { autoRuleLabel } from "@/components/tasks/labels";
import { TaskMetaLine } from "@/components/tasks/task-section";
import { listOrganizationJournal } from "@/db/queries/activities";
import { countContacts } from "@/db/queries/contacts";
import { getFollowUpBoard } from "@/db/queries/deal-follow-up";
import { getOwnOrganization, getVisibleOrganizations } from "@/db/queries/organizations";
import { listPartners } from "@/db/queries/partners";
import { generateAutoTasks, getTasksDueSummary } from "@/db/queries/tasks";
import { countPendingInvitations } from "@/db/queries/workspace-invitations";
import { getOnboardingFacts } from "@/db/queries/onboarding";
import { OnboardingChecklist } from "@/components/dashboard/onboarding-checklist";
import { ONBOARDING_COOKIE, readOnboardingProgress } from "@/lib/onboarding/steps";
import { parseTourState, TOUR_COOKIE, TOUR_PARAM } from "@/lib/tour/steps";
import { cookies } from "next/headers";
import { setActiveOrganizationAction, updateAuthSettingsAction } from "@/lib/admin/actions";
import { getAuthSettings } from "@/db/queries/auth-settings";
import { Field } from "@/components/ui/field";
import { createDemoAction, resetDemoAction, setDemoPublicAction } from "@/lib/demo/actions";
import { listDemoJournal } from "@/lib/demo/journal";
import { getDemoOrganization } from "@/lib/demo/seed";
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
export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ periode?: string; erreur?: string; info?: string } & Record<string, string | undefined>> }) {
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
    const [td, ts] = await Promise.all([getTranslations("demo.manager"), getTranslations("dashboard.authSettings")]);
    const [organizations, demo, journal, pendingInvitations, authSettingsValues] = await Promise.all([
      getVisibleOrganizations(user),
      getDemoOrganization(),
      listDemoJournal(1),
      countPendingInvitations(user),
      getAuthSettings(),
    ]);
    const lastOperation = journal[0] ?? null;
    async function createDemo() {
      "use server";
      await createDemoAction();
    }
    async function openDemo() {
      "use server";
      await setDemoPublicAction(true);
    }
    async function closeDemo() {
      "use server";
      await setDemoPublicAction(false);
    }
    async function resetDemo(formData: FormData) {
      "use server";
      await resetDemoAction(formData);
    }
    return (
      <>
        <PageHeader
          title={t("organisations")}
          description={t("vue_globale_super_admin_choisis_une_36d9")}
        />
        <ListCard>
          {organizations.map((org) => (
            <ListRow key={org.id}>
              {/* L'ellipse sur le TEXTE, pas sur le conteneur flex (où elle n'agit pas et écrasait le badge « Démo ») ; un
                  bouton court à droite, pas un lien de deux lignes qui mangeait le nom (audit UI du 2026-09-14). */}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="text-sm font-medium break-words">{org.name}</span>
                  {org.isDemo && (
                    <Badge variant="secondary" className="shrink-0">
                      {td("badge")}
                    </Badge>
                  )}
                </span>
                <span className="text-xs text-muted-foreground break-all">{org.slug}</span>
              </span>
              <form action={workIn} className="shrink-0">
                <input type="hidden" name="orgId" value={org.id} />
                <Button type="submit" variant="outline" size="sm">
                  {t("entrer")}
                </Button>
              </form>
            </ListRow>
          ))}
        </ListCard>
        {/* Les invitations d'espaces (docs/module-invitations.md §1.3) : le compte des liens en attente, et le geste pour en générer un. */}
        <Card>
          <CardHeader>
            <CardTitle>{t("invitations_titre")}</CardTitle>
            <CardDescription>{t("invitations_description", { count: pendingInvitations })}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Link href="/invitations?nouveau=1" className={buttonVariants({ size: "sm" })}>
              <MailPlus />
              {t("nouvelle_invitation")}
            </Link>
            <Link href="/invitations" className={buttonVariants({ variant: "outline", size: "sm" })}>
              {t("gerer_les_invitations")}
            </Link>
          </CardContent>
        </Card>
        {/* Les durées de la connexion (correctif du 2026-09-17) : validité du lien et durée de session, pour tout le produit. */}
        <Card>
          <CardHeader>
            <CardTitle>{ts("titre")}</CardTitle>
            <CardDescription>{ts("description")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <form action={updateAuthSettingsAction} className="flex flex-wrap items-end gap-3">
              <Field label={ts("validite_du_lien_minutes")} htmlFor="auth-link-minutes">
                <Input id="auth-link-minutes" name="linkValidityMinutes" type="number" min={5} max={1440} step={1} required defaultValue={authSettingsValues.linkValidityMinutes} className="w-28" />
              </Field>
              <Field label={ts("duree_de_session_jours")} htmlFor="auth-session-days">
                <Input id="auth-session-days" name="sessionDays" type="number" min={1} max={90} step={1} required defaultValue={authSettingsValues.sessionDays} className="w-28" />
              </Field>
              <Button type="submit" variant="outline">{ts("enregistrer")}</Button>
            </form>
            <p className="text-xs text-muted-foreground text-pretty">{ts("note")}</p>
          </CardContent>
        </Card>
        {/* L'espace gestionnaire de la démo (docs/module-demo.md §1.9) : création, interrupteur de la démo publique, dernière opération. */}
        <Card>
          <CardHeader>
            <CardTitle>{td("titre")}</CardTitle>
            <CardDescription>{td("description")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {demo ? (
              <>
                <p>
                  <span className="font-medium">{demo.name}</span> <span className="text-muted-foreground">({demo.slug})</span>
                </p>
                <p className={demo.demoPublicEnabled ? "rounded-lg border border-warning/40 bg-warning/5 px-3 py-2" : "text-muted-foreground"}>
                  {demo.demoPublicEnabled ? td("publique_ouverte") : td("publique_fermee")}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {demo.demoPublicEnabled ? (
                    <>
                      <form action={closeDemo}>
                        <Button type="submit" variant="outline">{td("fermer")}</Button>
                      </form>
                      {/* Un <a>, pas un Link : /demo AGIT (elle pose le cookie de visite) et un préchargement
                          faisait du super admin un visiteur en lecture seule dès l'affichage de cette carte (§1.4). */}
                      <a href="/demo" className={buttonVariants({ variant: "ghost" })}>{td("visiter")}</a>
                    </>
                  ) : (
                    <form action={openDemo}>
                      <Button type="submit" variant="outline">{td("ouvrir")}</Button>
                    </form>
                  )}
                </div>
                {/* La réinitialisation (§1.7) : confirmation explicite — le slug retapé —, périmètre dit sous le bouton, journal
                    avant/après. Repliée : un geste rare et irréversible n'a rien à faire déplié à chaque ouverture de l'accueil. */}
                <DetailsCard variant="archive" summary={td("reinitialiser")}>
                  <form action={resetDemo} className="flex flex-col gap-2">
                    <p className="text-xs text-muted-foreground text-pretty">{td("reinitialisation_explication", { slug: demo.slug })}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input name="confirmation" required autoComplete="off" placeholder={demo.slug} aria-label={td("confirmation_label")} className="w-40" />
                      <Button type="submit" variant="destructive">{td("reinitialiser")}</Button>
                    </div>
                  </form>
                </DetailsCard>
                {lastOperation && (
                  <p className="text-xs text-muted-foreground">
                    {td("derniere_operation", { kind: td(`kind.${lastOperation.kind === "reset" ? "reset" : "seed"}`), when: fmt.dateTime(lastOperation.startedAt), status: td(`status.${lastOperation.status === "done" ? "done" : lastOperation.status === "failed" ? "failed" : "running"}`) })}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="text-muted-foreground">{td("aucune_demo")}</p>
                <form action={createDemo}>
                  <Button type="submit">{td("creer")}</Button>
                </form>
                <p className="text-xs text-muted-foreground">{td("creation_note")}</p>
              </>
            )}
          </CardContent>
        </Card>
      </>
    );
  }

  // Comme l'écran des tâches : ouvrir le tableau de bord matérialise en
  // tâches ce que le suivi signale (idempotent, voir generateAutoTasks) —
  // sinon la tuile « À relancer » et la liste « à faire » se contrediraient
  // tant qu'on n'a pas ouvert /taches. Le tableau déjà calculé est réutilisé.
  //
  // Cette chaîne-là — le suivi, puis l'écriture des tâches automatiques, puis
  // le « à faire » qui les lit — reste en série ; TOUT LE RESTE ne dépend que
  // de l'organisation et part en même temps (performance, 2026-09-17 :
  // avant, une vingtaine d'allers-retours dont la moitié en série).
  const boardAndTasks = (async () => {
    const board = await getFollowUpBoard(user);
    await generateAutoTasks(user, board);
    return { board, tasksDue: await getTasksDueSummary(user, TASKS_PREVIEW) };
  })();
  const ta = await getTranslations("activities.queries");
  const [{ board, tasksDue }, org, open, anyDeal, contactsCount, partners, journal, onboardingFacts, cookieStore] = await Promise.all([
    boardAndTasks,
    getOwnOrganization(user),
    openDeals(user),
    hasAnyDeal(user),
    countContacts(user),
    listPartners(user),
    listOrganizationJournal(user, JOURNAL_PREVIEW, ta),
    getOnboardingFacts(user),
    cookies(),
  ]);
  // Les premiers pas (chantier UI/UX) : cochés par les données, masqués par un cookie, disparus quand tout est fait.
  const onboarding = readOnboardingProgress(onboardingFacts);
  const showOnboarding = !onboarding.complete && cookieStore.get(ONBOARDING_COOKIE)?.value !== "masque";
  // La visite guidée tourne (cookie, ou l'URL qui vient de la lancer) : la carte des premiers pas ne la propose pas une seconde fois.
  const tourRunning = raw[TOUR_PARAM] === "1" || parseTourState(cookieStore.get(TOUR_COOKIE)?.value)?.status === "en_cours";
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
            {/* Le formulaire déplié, comme le menu « Nouveau » et l'état vide — pas la liste. */}
            <Link href="/affaires?nouveau=1" className={buttonVariants()}>
              <Plus />
              {t("nouvelle_affaire")}
            </Link>
          </>
        }
      />

      {showOnboarding && <OnboardingChecklist progress={onboarding} tourRunning={tourRunning} />}
      {isFreshSpace && !showOnboarding && (
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
      <div data-tour="dashboard-tuiles" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
          // « — » n'est pas zéro pour la tuile : la couleur ne se pose que sur un montant (stabilisation, P7).
          tone={unpaidTotal > 0 ? "success" : "neutral"}
          href="/suivi"
        />
      </div>

      <section className="flex flex-col gap-3">
        <SectionHeading
          title={t("a_faire_aujourd_hui")}
          trailing={
            <Link href="/taches" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              {t("toutes_les_taches")}
              <ArrowRight />
            </Link>
          }
        />

        {tasksDue.rows.length === 0 ? (
          <EmptyState className="py-8">{t("rien_d_echu_ni_de_prevu_3031")}</EmptyState>
        ) : (
          <>
            <ListCard>
              {tasksDue.rows.map((task) => (
                <li key={task.id} className="flex items-center gap-3 px-4 py-3">
                  <CompleteTaskButton taskId={task.id} backTo="/dashboard" title={task.title} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium break-words">{task.title}</span>
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
        <SectionHeading
          title={t("a_traiter_en_priorite")}
          trailing={
            <Link href="/suivi" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              {t("tout_le_suivi")}
              <ArrowRight />
            </Link>
          }
        />

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

      {/* Les indicateurs du pack métier : la matière, pas l'urgence — ton neutre, et APRÈS le travail du jour (audit UI du
          2026-09-14 : huit tuiles analytiques repoussaient les tâches en retard sous la ligne de flottaison). Ils arrivent en
          flux (Suspense) : l'analytique n'attend pas le reste. */}
      <Suspense fallback={<SkeletonTiles count={8} />}>
        <PackIndicators user={user} businessPack={org?.businessPack ?? null} parsed={parsed} />
      </Suspense>

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
