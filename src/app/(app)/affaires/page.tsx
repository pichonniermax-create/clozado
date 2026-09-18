import Link from "next/link";
import { ContactPicker } from "@/components/contacts/contact-picker";
import { errorMessage, withError } from "@/lib/form-actions";
import { redirect } from "next/navigation";
import { ArrowDown, ArrowUp, Columns3, Rows3 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DealStatusBadge } from "@/components/deals/deal-status-badge";
import { DetailsCard } from "@/components/ui/details-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { AmountInput } from "@/components/ui/amount-input";
import { Input } from "@/components/ui/input";
import { KanbanBoard } from "@/components/deals/kanban-board";
import { DealSelectionBanner, describeDealSelection, selectionQuery } from "@/components/deals/selection-banner";
import { PageHeader } from "@/components/app-shell/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { listOrigins } from "@/db/queries/acquisition";
import { getContact, listOrgUsers } from "@/db/queries/contacts";
import { defaultOwnerId } from "@/lib/default-owner";
import { listDealTypes } from "@/db/queries/deal-types";
import {
  DEALS_PAGE_SIZE,
  dealsIndicators,
  listDealsBoard,
  listDealsTable,
  type DealsTableSort,
} from "@/db/queries/deals";
import { listLossReasons } from "@/db/queries/loss-reasons";
import { listPipelinesWithStages } from "@/db/queries/pipelines";
import { createDealAction, createDealTypeAction } from "@/lib/deals/actions";
import { getFormats } from "@/i18n/formats";
import { metricQueryString, parseDealSelection, type DealSelectionParams, type ParsedDealSelection } from "@/lib/metrics";
import { PREF, preferenceString } from "@/db/queries/preferences";
import { DensityToggle } from "@/components/display/density-toggle";
import { ViewsMenu } from "@/components/display/views-menu";
import { withRememberedPeriod } from "@/lib/display/period";
import { periodPhrase } from "@/lib/metrics/period-phrase";
import { resolveDisplay } from "@/lib/display/resolve";
import { displayScreen } from "@/lib/display/screens";
import { DEFAULT_DENSITY, ME, resolveOwnerFilter, VIEW_PARAM } from "@/lib/display/state";
import { FilterBuilder } from "@/components/display/filter-builder";
import { FilterChips, type FilterChip } from "@/components/display/filter-chips";
import { describeCondition } from "@/lib/display/filter-labels";
import { FILTER_PARAM, filterFields, parseFilters, resolveMe, serializeFilters, withoutCondition } from "@/lib/display/filters";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { getTranslations } from "next-intl/server";
import { NativeSelect } from "@/components/ui/native-select";

/**
 * Les paramètres natifs de la liste, plus ceux d'une SÉLECTION venue du
 * funnel (`DealSelectionParams` : période, type, origine, cohorte, étape
 * atteinte, issue) — validés par la couche de métriques, jamais transmis
 * bruts à la base.
 */
type Params = DealSelectionParams & {
  /** `?v=<id>` : la vue enregistrée appliquée (lot 1) — à ne pas confondre avec `vue`, le kanban ou la liste. */
  v?: string;
  densite?: string;
  vue?: string;
  pipeline?: string;
  etape?: string;
  conseiller?: string;
  tri?: string;
  dir?: string;
  page?: string;
  contact?: string;
  /** « 1 » : le formulaire de création s'ouvre déplié (un état vide y envoie). */
  nouveau?: string;
};

async function addDealType(formData: FormData) {
  "use server";
  const label = String(formData.get("typeLabel") ?? "").trim();
  // Plus de retour muet (stabilisation, E4) : la phrase revient en notification.
  if (!label) redirect(withError("/affaires", (await getTranslations("errors"))("le_libelle_du_type_d_affaire_est_obligatoire")));
  let destination = "/affaires";
  try {
    await createDealTypeAction(label);
  } catch (error) {
    destination = withError("/affaires", await errorMessage(error));
  }
  redirect(destination);
}

export default async function DealsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const tr = await getTranslations("deals.list");
  const fmt = await getFormats();
  const user = await requireUser();
  const raw = await searchParams;
  // L'affichage effectif (lot 1) : la vue enregistrée si l'adresse en désigne une, les paramètres de l'adresse
  // par-dessus, la période mémorisée quand l'adresse se tait, et « moi » résolu en identifiant.
  const screen = displayScreen("affaires")!;
  const display = await resolveDisplay(user, screen, raw as Record<string, string | undefined>);
  const params: Params = {
    ...(withRememberedPeriod(display.params, display.preferences) as Params),
    conseiller: resolveOwnerFilter(display.params.conseiller, user.id),
    // Deux paramètres qui ne décrivent pas un affichage et ne se mémorisent donc jamais : ils viennent de l'adresse.
    nouveau: raw.nouveau,
    contact: raw.contact,
  };
  // Une sélection analytique n'a de sens qu'en liste : le kanban ne filtre pas.
  const sel = parseDealSelection(params, fmt.timeZone);
  // Le constructeur de filtres (lot 3) : lu dans l'adresse, « moi » résolu juste avant la base.
  const conditions = parseFilters("affaires", display.params[FILTER_PARAM]);
  const vue = params.vue === "liste" || sel.analytic || conditions.length > 0 ? "liste" : "kanban";
  const density = display.density ?? DEFAULT_DENSITY;

  if (sel.analytic && !user.organizationId) {
    return (
      <>
        <PageHeader title={tr("affaires")} description={tr("les_dossiers_que_tu_suis_du_a753")} />
        <EmptyState title={tr("tu_es_en_vue_globale")}>
          {tr("cette_selection_vient_du_funnel_d_5c40")}
        </EmptyState>
      </>
    );
  }

  const [pipelines, types, orgUsers, lossReasons, origins, prefillContact] = await Promise.all([
    listPipelinesWithStages(user),
    listDealTypes(user),
    listOrgUsers(user),
    listLossReasons(user),
    sel.analytic ? listOrigins(user) : Promise.resolve([]),
    // La fiche qui pré-remplit le formulaire (`?contact=`), lue avec le reste plutôt qu'après (performance, 2026-09-17).
    params.contact ? getContact(user, params.contact).catch(() => null) : Promise.resolve(null),
  ]);

  if (pipelines.length === 0) {
    return (
      <>
        <PageHeader title={tr("affaires")} description={tr("les_dossiers_que_tu_suis_du_a753")} />
        {user.organizationId ? (
          <EmptyState
            title={tr("aucun_pipeline_dans_cette_organisation")}
            action={
              <Link href="/settings" className={buttonVariants({ variant: "outline" })}>
                {tr("configurer_un_pipeline")}
              </Link>
            }
          >
            {tr("un_pipeline_est_une_famille_d_ad50")}
          </EmptyState>
        ) : (
          <EmptyState title={tr("tu_es_en_vue_globale")}>
            {tr("choisis_une_organisation_dans_le_bandeau_d4cd")}
          </EmptyState>
        )}
      </>
    );
  }

  const pipeline = pipelines.find((p) => p.id === params.pipeline) ?? pipelines[0];
  const stages = pipeline.stages;
  const tf = await getTranslations("ui.filters");
  const filterOptions: Record<string, { value: string; label: string }[]> = {
    conseiller: orgUsers.map((u) => ({ value: u.id, label: u.name || u.email })),
    etape: pipelines.flatMap((pl) => pl.stages.map((st) => ({ value: st.id, label: st.label }))),
    type: types.map((ty) => ({ value: ty.id, label: ty.label })),
    pipeline: pipelines.map((pl) => ({ value: pl.id, label: pl.label })),
    issue: [
      { value: "gagnee", label: tr("gagnees_filtre") },
      { value: "perdue", label: tr("perdues_filtre") },
      { value: "en-cours", label: tr("en_cours_filtre") },
    ],
  };
  const labelOfFilter = (field: string, value: string) => filterOptions[field]?.find((o) => o.value === value)?.label ?? null;
  // Les paramètres de la sélection analytique voyagent avec le tri, la
  // pagination et les filtres natifs — et disparaissent en repassant au kanban.
  const selectionParams = sel.analytic ? selectionQuery(sel) : {};
  const clearSelection = Object.fromEntries(Object.keys(selectionParams).map((k) => [k, undefined]));
  const baseQuery = (over: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      ...selectionParams,
      // La vue enregistrée et la densité voyagent avec le reste : trier ou paginer ne fait pas perdre son cadrage.
      [VIEW_PARAM]: display.view?.id,
      [FILTER_PARAM]: display.params[FILTER_PARAM],
      densite: display.params.densite,
      vue,
      pipeline: pipeline.id,
      etape: params.etape,
      conseiller: display.params.conseiller,
      tri: params.tri,
      dir: params.dir,
      ...over,
    };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    return `/affaires?${sp.toString()}`;
  };

  async function addDeal(formData: FormData) {
    "use server";
    const title = String(formData.get("title") ?? "").trim();
    const clientName = String(formData.get("clientName") ?? "").trim();
    const typeId = String(formData.get("typeId") ?? "").trim();
    const contactId = String(formData.get("contactId") ?? "").trim() || null;
    const ownerId = String(formData.get("ownerId") ?? "").trim() || null;
    const statusId = String(formData.get("statusId") ?? "").trim() || undefined;
    const backTo = `/affaires?vue=${formData.get("vue")}&pipeline=${formData.get("pipelineId")}`;
    // Chaque manque a sa phrase et ramène au formulaire ouvert (stabilisation, E4) — avant, « Créer l'affaire » ne
    // faisait rien du tout quand le type n'était pas choisi.
    const te = await getTranslations("errors");
    if (!title) redirect(withError(`${backTo}&nouveau=1`, te("le_titre_est_obligatoire")));
    if (!typeId) redirect(withError(`${backTo}&nouveau=1`, te("le_type_d_affaire_est_obligatoire")));
    if (!clientName && !contactId) redirect(withError(`${backTo}&nouveau=1`, te("indique_le_client_de_l_affaire")));

    const rawAmount = String(formData.get("estimatedAmount") ?? "").trim();
    let destination = backTo;
    try {
      const deal = await createDealAction({
        title,
        clientName,
        typeId,
        statusId,
        contactId,
        ownerId,
        estimatedAmount: rawAmount || null,
        description: String(formData.get("description") ?? "").trim() || null,
      });
      // Vers la fiche créée (stabilisation, P1) : c'est là qu'on complète — pas un retour à la liste.
      destination = `/affaires/${deal.id}`;
    } catch (error) {
      destination = withError(`${backTo}&nouveau=1`, await errorMessage(error));
    }
    redirect(destination);
  }

  return (
    <>
      <PageHeader
        title={tr("affaires")}
        description={tr("les_dossiers_que_tu_suis_le_a590")}
        actions={
          <div className="flex rounded-lg border border-border p-0.5">
            <Link
              href={baseQuery({ vue: "kanban", page: undefined, ...clearSelection })}
              className={cn(
                "inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 py-1 text-sm transition-colors md:min-h-7 md:px-2.5",
                vue === "kanban" ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              aria-current={vue === "kanban" ? "page" : undefined}
            >
              <Columns3 className="size-4" />
              {tr("kanban")}
            </Link>
            <Link
              href={baseQuery({ vue: "liste", page: undefined })}
              className={cn(
                "inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 py-1 text-sm transition-colors md:min-h-7 md:px-2.5",
                vue === "liste" ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              aria-current={vue === "liste" ? "page" : undefined}
            >
              <Rows3 className="size-4" />
              {tr("liste")}
            </Link>
          </div>
        }
      />

      {/* Le cadrage de la liste : vues enregistrées, densité (lot 1). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ViewsMenu
          screen="affaires"
          basePath="/affaires"
          views={display.views.map((v) => ({ id: v.id, name: v.name, builtin: v.builtin, shared: v.shared, editable: v.editable, mine: v.mine }))}
          currentId={display.view?.id ?? null}
          modified={display.modified}
          state={new URLSearchParams(Object.entries(display.params).filter(([k]) => k !== VIEW_PARAM)).toString()}
          isAdmin={user.role === "admin"}
          defaultViewId={preferenceString(display.preferences, PREF.defaultView("affaires")) ?? null}
        />
        <div className="flex items-center gap-2">
          {/* Le constructeur : « montant supérieur à 200 000 et étape égale à Négociation et conseiller égal à moi ». */}
          <FilterBuilder
            fields={filterFields("affaires").map((f) => ({ key: f.key, type: f.type, me: f.me, options: filterOptions[f.key] }))}
            conditions={conditions}
            basePath="/affaires"
            keep={Object.fromEntries(
              Object.entries({ ...display.params, vue: "liste", pipeline: pipeline.id }).filter(
                ([k, v]) => k !== FILTER_PARAM && k !== "page" && typeof v === "string" && v
              ) as [string, string][]
            )}
          />
          {vue === "liste" && <DensityToggle current={density} hrefFor={(d) => baseQuery({ densite: d === DEFAULT_DENSITY ? undefined : d })} />}
        </div>
      </div>

      {/* LE SÉLECTEUR DE FILIÈRE, toujours visible (chantier affaires) : avec une seule filière il n'y avait
          RIEN — on ne savait pas qu'on regardait « Crédit immobilier » plutôt que l'ensemble, ni que d'autres
          filières existaient. Une filière : son nom, et le chemin pour en créer une. Plusieurs : des onglets. */}
      <nav className="flex flex-wrap items-center gap-1 border-b border-border" aria-label={tr("pipelines")}>
        {pipelines.length === 1 ? (
          <span className="-mb-px inline-flex min-h-11 items-center border-b-2 border-primary px-3 text-sm font-medium md:min-h-9">
            {pipelines[0].label}
          </span>
        ) : (
          pipelines.map((p) => (
            <Link
              key={p.id}
              // L'affichage courant SUIT le pipeline (filtres, tri, densité) : avant, chaque onglet repartait
              // d'une adresse nue et jetait ce que la personne venait de régler.
              href={baseQuery({ pipeline: p.id, page: undefined })}
              className={cn(
                // 44 px au doigt, 36 px à la souris (audit UI du 2026-09-14).
                "-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-sm transition-colors md:min-h-9",
                p.id === pipeline.id
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
              aria-current={p.id === pipeline.id ? "page" : undefined}
            >
              {p.label}
            </Link>
          ))
        )}
        {user.role === "admin" && (
          <Link href="/settings#pipelines" className="ml-auto inline-flex min-h-11 items-center px-3 text-xs text-muted-foreground transition-colors hover:text-foreground md:min-h-9">
            {tr("gerer_les_pipelines")}
          </Link>
        )}
      </nav>

      {types.length === 0 ? (
        // Sans type d'affaire, rien n'est créable : c'est le seul écran où
        // la configuration passe devant la liste, parce qu'elle la bloque.
        <Card>
          <CardHeader>
            <CardTitle>{tr("configure_au_moins_un_type_d_d650")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              {tr("ton_organisation_n_a_pas_encore_d491")}
            </p>
            <form action={addDealType} className="flex items-end gap-2">
              <Field label={tr("nom_du_type")} htmlFor="typeLabel" className="flex-1">
                <Input id="typeLabel" name="typeLabel" required />
              </Field>
              <Button type="submit">{tr("ajouter")}</Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <DetailsCard
          summary={
            prefillContact ? tr("nouvelle_affaire_pour", { name: prefillContact.name }) : tr("nouvelle_affaire")
          }
          // Déplié quand on vient pour créer : depuis une fiche contact, ou
          // depuis un état vide (« Créer une affaire »).
          defaultOpen={Boolean(prefillContact) || params.nouveau === "1"}
          tour="affaires-nouvelle"
        >
          <form action={addDeal} className="flex flex-col gap-4">
            <input type="hidden" name="vue" value={vue} />
            <input type="hidden" name="pipelineId" value={pipeline.id} />
            {/* L'affaire naît dans le pipeline affiché, à sa première étape. */}
            <input type="hidden" name="statusId" value={stages[0]?.id ?? ""} />
            {prefillContact && (
              <p className="text-sm text-muted-foreground">
                {tr.rich("cette_affaire_sera_reliee_a_la_eee1", { name: prefillContact.name, span: (chunks) => <span className="font-medium text-foreground">{chunks}</span> })}
              </p>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={tr("libelle")} htmlFor="title">
                <Input id="title" name="title" placeholder={tr("financement_appartement_lyon")} required />
              </Field>
              <Field label={tr("client_concerne")} htmlFor="clientName">
                {/* Une fiche existante par son nom, ou un nom libre (stabilisation, P1). */}
                <ContactPicker
                  inputId="clientName"
                  initialName={prefillContact?.name ?? ""}
                  initialContactId={prefillContact?.id ?? null}
                  placeholder={tr("m_et_mme_perrin")}
                  required
                />
              </Field>
              <Field label={tr("type")} htmlFor="typeId">
                <Select
                  name="typeId"
                  // Voir la note dans partner-share-view.tsx : sans `items`,
                  // le déclencheur affiche l'UUID au lieu du libellé.
                  items={types.map((t) => ({ label: t.label, value: t.id }))}
                >
                  <SelectTrigger id="typeId" className="w-full">
                    <SelectValue placeholder={tr("choisir_un_type")} />
                  </SelectTrigger>
                  <SelectContent>
                    {types.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={tr("montant_estime", { currency: fmt.currency })} htmlFor="estimatedAmount">
                <AmountInput id="estimatedAmount" name="estimatedAmount" />
              </Field>
              {/* Le responsable, la personne connectée par défaut (stabilisation, P1) — ou l'admin le plus ancien pour un
                  super admin en substitution (src/lib/default-owner.ts) ; à plusieurs, le choix. */}
              {orgUsers.length > 1 ? (
                <Field label={tr("responsable")} htmlFor="ownerId">
                  <NativeSelect id="ownerId" name="ownerId" defaultValue={defaultOwnerId(user, orgUsers) ?? ""} className="w-full">
                    <option value="">{tr("personne")}</option>
                    {orgUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name || u.email}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              ) : (
                <input type="hidden" name="ownerId" value={defaultOwnerId(user, orgUsers) ?? ""} />
              )}
            </div>
            <Field label={tr("description")} htmlFor="description">
              <Textarea id="description" name="description" className="min-h-16" />
            </Field>
            <Button type="submit" className="w-fit">
              {tr("creer_l_affaire")}
            </Button>
          </form>
        </DetailsCard>
      )}

      {/* LE BANDEAU (chantier affaires) : six chiffres au-dessus du kanban ET de la liste, qui suivent les
          filtres actifs. Deux temps, dits à l'écran : l'état d'aujourd'hui, et ce qui s'est joué dans la période. */}
      <DealsBanner
        user={user}
        pipelineId={pipeline.id}
        statusId={params.etape || undefined}
        ownerId={sel.parsed.filters.ownerId}
        selection={sel.analytic ? sel.selection : undefined}
        filters={resolveMe(conditions, user.id)}
        timeZone={fmt.timeZone}
        from={sel.parsed.filters.from}
        to={sel.parsed.filters.to}
        parsed={sel.parsed}
      />

      {vue === "kanban" ? (
        <KanbanView user={user} pipelineId={pipeline.id} stages={stages} lossReasons={lossReasons} />
      ) : (
        <ListeView
          user={user}
          pipelineId={pipeline.id}
          stages={stages}
          orgUsers={orgUsers}
          types={types}
          origins={origins}
          lossReasons={lossReasons}
          params={params}
          sel={sel}
          baseQuery={baseQuery}
          ownerParam={display.params.conseiller}
          dense={density === "compacte"}
          filters={resolveMe(conditions, user.id)}
          conditionChips={conditions.map((condition, index) => ({
            key: `f-${index}`,
            label: describeCondition(condition, (k, vals) => tf(k as never, vals as never), labelOfFilter),
            href: baseQuery({ [FILTER_PARAM]: serializeFilters(withoutCondition(conditions, index)) || undefined, page: undefined }),
          }))}
        />
      )}
    </>
  );
}

async function KanbanView({
  user,
  pipelineId,
  stages,
  lossReasons,
}: {
  user: Awaited<ReturnType<typeof requireUser>>;
  pipelineId: string;
  stages: Awaited<ReturnType<typeof listPipelinesWithStages>>[number]["stages"];
  lossReasons: Awaited<ReturnType<typeof listLossReasons>>;
}) {
  const t = await getTranslations("deals.list");
  const cards = await listDealsBoard(user, pipelineId);
  return (
    <>
      {cards.length === 0 && (
        <EmptyState
          title={t("aucune_affaire_dans_ce_pipeline_pour_7a84")}
          action={
            <Link
              href={`/affaires?vue=kanban&pipeline=${pipelineId}&nouveau=1`}
              className={buttonVariants({ variant: "outline" })}
            >
              {t("creer_une_affaire")}
            </Link>
          }
        >
          {t("chaque_colonne_est_une_etape_une_e808")}
        </EmptyState>
      )}
    <KanbanBoard
      stages={stages.map((s) => ({
        id: s.id,
        label: s.label,
        color: s.color,
        probability: s.probability,
        outcome: s.outcome,
      }))}
      cards={cards.map((c) => ({
        id: c.id,
        title: c.title,
        clientName: c.clientName,
        statusId: c.statusId,
        estimatedAmount: c.estimatedAmount,
        expectedCloseDate: c.expectedCloseDate,
        lossReasonId: c.lossReasonId,
        ownerName: c.ownerName,
      }))}
      lossReasons={lossReasons.map((r) => ({ id: r.id, label: r.label }))}
    />
    </>
  );
}

async function ListeView({
  user,
  pipelineId,
  stages,
  orgUsers,
  types,
  origins,
  lossReasons,
  params,
  sel,
  baseQuery,
  ownerParam,
  dense,
  filters,
  conditionChips,
}: {
  user: Awaited<ReturnType<typeof requireUser>>;
  pipelineId: string;
  stages: Awaited<ReturnType<typeof listPipelinesWithStages>>[number]["stages"];
  orgUsers: Awaited<ReturnType<typeof listOrgUsers>>;
  types: Awaited<ReturnType<typeof listDealTypes>>;
  origins: { id: string; label: string }[];
  lossReasons: { id: string; label: string }[];
  params: Params;
  sel: ParsedDealSelection;
  baseQuery: (over: Record<string, string | undefined>) => string;
  /** Le conseiller tel qu'il est écrit dans l'adresse : `moi` reste `moi` dans le sélecteur. */
  ownerParam?: string;
  dense: boolean;
  /** Le jeu du constructeur, « moi » déjà résolu (lot 3). */
  filters: ReturnType<typeof parseFilters>;
  /** Les pastilles des conditions, rendues par l'écran parent (mêmes libellés partout). */
  conditionChips: FilterChip[];
}) {
  const t = await getTranslations("deals.list");
  const fmt = await getFormats();
  const sort = (["title", "amount", "close", "stage", "updated"] as const).includes(
    params.tri as DealsTableSort
  )
    ? (params.tri as DealsTableSort)
    : "updated";
  const dir = params.dir === "asc" ? "asc" : "desc";
  const page = Number(params.page) > 0 ? Number(params.page) : 1;

  const { rows, total, pageCount } = await listDealsTable(user, {
    pipelineId,
    statusId: params.etape || undefined,
    filters,
    timeZone: fmt.timeZone,
    // Le conseiller passe par la même validation que les paramètres analytiques (UUID ou rien).
    ownerId: sel.parsed.filters.ownerId,
    selection: sel.analytic ? sel.selection : undefined,
    sort,
    dir,
    page,
  });
  const selectionParams = sel.analytic ? selectionQuery(sel) : {};

  const sortLink = (key: DealsTableSort, label: string) => {
    const active = sort === key;
    const nextDir = active && dir === "desc" ? "asc" : "desc";
    return (
      <Link
        href={baseQuery({ tri: key, dir: nextDir, page: undefined })}
        className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}
      >
        {label}
        {active &&
          (dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </Link>
    );
  };

  const todayIso = new Date().toISOString().slice(0, 10);
  return (
    <section className="flex flex-col gap-3">
      {sel.analytic && (
        <DealSelectionBanner
          description={describeDealSelection(sel, { stages, types, origins, users: orgUsers, reasons: lossReasons }, await getTranslations("deals.selectionBanner"), await getTranslations("metrics"), fmt)}
          total={total}
          clearHref={`/affaires?vue=liste&pipeline=${pipelineId}`}
          backHref={`${sel.selection.cohort === "perte" ? "/analytique/pertes" : "/analytique/funnel"}${metricQueryString(sel.parsed.params)}`}
          backLabel={sel.selection.cohort === "perte" ? t("revenir_aux_pertes") : t("revenir_au_funnel")}
        />
      )}
      <form method="get" className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="vue" value="liste" />
        <input type="hidden" name="pipeline" value={pipelineId} />
        {params.v && <input type="hidden" name="v" value={params.v} />}
        {params.densite && <input type="hidden" name="densite" value={params.densite} />}
        {Object.entries(selectionParams).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
        <NativeSelect
          name="etape"
          defaultValue={params.etape ?? ""} className="w-auto max-w-full"
          aria-label={t("filtrer_par_etape")}
        >
          <option value="">{t("toutes_les_etapes")}</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </NativeSelect>
        {orgUsers.length > 1 && (
          <NativeSelect
            name="conseiller"
            defaultValue={ownerParam ?? ""} className="w-auto max-w-full"
            aria-label={t("filtrer_par_conseiller")}
          >
            <option value="">{t("tous_les_conseillers")}</option>
            {/* « Moi » n'est pas un identifiant : il est résolu pour qui regarde — une vue partagée dit bien « les miennes » à chacun. */}
            <option value={ME}>{t("moi")}</option>
            {orgUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email}
              </option>
            ))}
          </NativeSelect>
        )}
        <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
          {t("filtrer")}
        </button>
        <span className="ml-auto text-sm tabular-nums text-muted-foreground">
          {t("affaire_affaires", { total })}
        </span>
      </form>

      {/* Les conditions du constructeur, dites et retirables une à une (lot 3). */}
      <FilterChips chips={conditionChips} clearHref={baseQuery({ [FILTER_PARAM]: undefined, page: undefined })} clearLabel={t("retirer_les_filtres")} />

      {rows.length === 0 ? (
        sel.analytic ? (
          <EmptyState
            title={t("aucune_affaire_dans_cette_selection")}
            action={
              <Link href={`/affaires?vue=liste&pipeline=${pipelineId}`} className={buttonVariants({ variant: "outline" })}>
                {t("retirer_la_selection")}
              </Link>
            }
          >
            {t("le_funnel_compte_zero_affaire_ici_d44f")}
          </EmptyState>
        ) : params.etape || sel.parsed.filters.ownerId ? (
          <EmptyState
            title={t("aucune_affaire_ne_correspond_a_ces_7212")}
            action={
              <Link
                href={`/affaires?vue=liste&pipeline=${pipelineId}`}
                className={buttonVariants({ variant: "outline" })}
              >
                {t("retirer_les_filtres")}
              </Link>
            }
          >
            {t("etape_et_conseiller_se_combinent_elargis_8bd8")}
          </EmptyState>
        ) : (
          <EmptyState
            title={t("aucune_affaire_dans_ce_pipeline_pour_7a84")}
            action={
              <Link
                href={`/affaires?vue=liste&pipeline=${pipelineId}&nouveau=1`}
                className={buttonVariants({ variant: "outline" })}
              >
                {t("creer_une_affaire")}
              </Link>
            }
          >
            {t("la_liste_est_faite_pour_travailler_e6fc")}
          </EmptyState>
        )
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          {/* Une largeur minimale : à 390 px, `w-full` écrasait sept colonnes au lieu de faire défiler le tableau. */}
          <table className="w-full min-w-[56rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">{sortLink("title", t("affaire"))}</th>
                <th className="px-4 py-2 font-medium">{t("client")}</th>
                <th className="px-4 py-2 font-medium">{sortLink("stage", t("etape"))}</th>
                <th className="px-4 py-2 text-right font-medium">{sortLink("amount", t("montant"))}</th>
                <th className="hidden px-4 py-2 text-right font-medium md:table-cell">{t("prob")}</th>
                <th className="px-4 py-2 font-medium">{sortLink("close", t("cloture_prevue"))}</th>
                <th className="px-4 py-2 font-medium">{t("responsable")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(({ deal, stageLabel, stageColor, stageProbability, stageOutcome, typeLabel, ownerName, lossReasonLabel }) => {
                const probability = deal.probability ?? stageProbability;
                // Une clôture prévue dépassée sur une affaire encore ouverte se signale (même règle que le kanban).
                const overdue = !stageOutcome && Boolean(deal.expectedCloseDate) && deal.expectedCloseDate! < todayIso;
                return (
                  <tr key={deal.id} className="transition-colors hover:bg-accent/40">
                    <td className={cn("max-w-64 px-4", dense ? "py-1" : "py-2.5")}>
                      <Link href={`/affaires/${deal.id}`} className="font-medium hover:underline">
                        {deal.title}
                      </Link>
                      <span className="block text-xs text-muted-foreground break-words">{typeLabel}</span>
                    </td>
                    <td className={cn("px-4 break-words", dense ? "py-1" : "py-2.5")}>{deal.clientName}</td>
                    <td className={cn("px-4", dense ? "py-1" : "py-2.5")}>
                      <DealStatusBadge label={stageLabel} color={stageColor} />
                      {stageOutcome === "lost" && lossReasonLabel && (
                        <span className="block pt-0.5 text-xs text-muted-foreground">{lossReasonLabel}</span>
                      )}
                    </td>
                    <td className={cn("px-4 text-right font-medium tabular-nums", dense ? "py-1" : "py-2.5")}>
                      {deal.estimatedAmount ? fmt.money(deal.estimatedAmount) : "—"}
                    </td>
                    <td className={cn("hidden px-4 text-right tabular-nums text-muted-foreground md:table-cell", dense ? "py-1" : "py-2.5")}>
                      {probability != null ? fmt.percent(probability) : "—"}
                    </td>
                    <td className={cn("px-4 tabular-nums", dense ? "py-1" : "py-2.5", overdue && "font-medium text-destructive")} title={overdue ? t("cloture_depassee") : undefined}>
                      {deal.expectedCloseDate ? fmt.date(deal.expectedCloseDate) : "—"}
                    </td>
                    <td className={cn("px-4 break-words", dense ? "py-1" : "py-2.5")}>{ownerName ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <nav className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link href={baseQuery({ page: String(page - 1) })} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              {t("precedentes")}
            </Link>
          ) : (
            <span />
          )}
          <span className="tabular-nums text-muted-foreground">
            {t("page_sur_par_page", { page, pageCount, dealsPageSize: DEALS_PAGE_SIZE })}
          </span>
          {page < pageCount ? (
            <Link href={baseQuery({ page: String(page + 1) })} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              {t("suivantes")}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </section>
  );
}

/**
 * Le bandeau d'indicateurs. Un composant serveur à part : sa requête part
 * en même temps que le rendu de la vue (Suspense au-dessus), et l'écran ne
 * l'attend pas pour montrer le kanban ou la liste.
 */
async function DealsBanner({
  user,
  parsed,
  ...opts
}: {
  user: Awaited<ReturnType<typeof requireUser>>;
  parsed: ParsedDealSelection["parsed"];
  pipelineId: string;
  statusId?: string;
  ownerId?: string;
  selection?: ReturnType<typeof parseDealSelection>["selection"];
  filters: ReturnType<typeof resolveMe>;
  timeZone: string;
  from?: Date;
  to?: Date;
}) {
  const t = await getTranslations("deals.banner");
  const tm = await getTranslations("metrics");
  const fmt = await getFormats();
  const i = await dealsIndicators(user, opts);
  if (i.n === 0) return null;

  const value = (v: string | number) => <dd className="text-lg font-semibold tracking-tight tabular-nums">{v}</dd>;
  return (
    <section aria-label={t("indicateurs")} className="flex flex-col gap-1.5">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border border-border bg-card px-4 py-3 sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <dt className="text-xs text-muted-foreground">{t("affaires")}</dt>
          {value(i.n)}
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("montant_total")}</dt>
          {value(i.amount > 0 ? (fmt.money(i.amount) ?? "—") : "—")}
        </div>
        <div>
          {/* Pondéré = montant × probabilité, sur les affaires EN COURS : la probabilité de l'affaire, sinon celle de son étape. */}
          <dt className="text-xs text-muted-foreground" title={t("montant_pondere_explication")}>{t("montant_pondere")}</dt>
          {value(i.weighted > 0 ? (fmt.money(Math.round(i.weighted)) ?? "—") : "—")}
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("montant_gagne")}</dt>
          {value(i.wonAmount > 0 ? (fmt.money(i.wonAmount) ?? "—") : "—")}
        </div>
        <div>
          <dt className="text-xs text-muted-foreground" title={t("transformation_explication")}>{t("transformation")}</dt>
          {value(i.transformation === null ? "—" : (fmt.percent(Math.round(i.transformation * 1000) / 10) ?? "—"))}
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t("age_moyen")}</dt>
          {value(i.averageAgeDays === null ? "—" : fmt.days(Math.round(i.averageAgeDays)))}
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        {t("deux_temps", { periodPhrase: periodPhrase(parsed, tm, fmt) })}
        {i.withoutAmount > 0 && ` ${t("sans_montant", { n: i.withoutAmount })}`}
      </p>
    </section>
  );
}
