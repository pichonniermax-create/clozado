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
  listDealsBoard,
  listDealsTable,
  type DealsTableSort,
} from "@/db/queries/deals";
import { listLossReasons } from "@/db/queries/loss-reasons";
import { listPipelinesWithStages } from "@/db/queries/pipelines";
import { createDealAction, createDealTypeAction } from "@/lib/deals/actions";
import { getFormats } from "@/i18n/formats";
import { metricQueryString, parseDealSelection, type DealSelectionParams, type ParsedDealSelection } from "@/lib/metrics";
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
  const params = await searchParams;
  // Une sélection analytique n'a de sens qu'en liste : le kanban ne filtre pas.
  const sel = parseDealSelection(params, fmt.timeZone);
  const vue = params.vue === "liste" || sel.analytic ? "liste" : "kanban";

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
  // Les paramètres de la sélection analytique voyagent avec le tri, la
  // pagination et les filtres natifs — et disparaissent en repassant au kanban.
  const selectionParams = sel.analytic ? selectionQuery(sel) : {};
  const clearSelection = Object.fromEntries(Object.keys(selectionParams).map((k) => [k, undefined]));
  const baseQuery = (over: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      ...selectionParams,
      vue,
      pipeline: pipeline.id,
      etape: params.etape,
      conseiller: sel.parsed.filters.ownerId,
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

      {pipelines.length > 1 && (
        <nav className="flex flex-wrap gap-1 border-b border-border" aria-label={tr("pipelines")}>
          {pipelines.map((p) => (
            <Link
              key={p.id}
              href={`/affaires?vue=${vue}&pipeline=${p.id}`}
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
          ))}
        </nav>
      )}

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
            defaultValue={sel.parsed.filters.ownerId ?? ""} className="w-auto max-w-full"
            aria-label={t("filtrer_par_conseiller")}
          >
            <option value="">{t("tous_les_conseillers")}</option>
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
                    <td className="max-w-64 px-4 py-2.5">
                      <Link href={`/affaires/${deal.id}`} className="font-medium hover:underline">
                        {deal.title}
                      </Link>
                      <span className="block text-xs text-muted-foreground break-words">{typeLabel}</span>
                    </td>
                    <td className="px-4 py-2.5 break-words">{deal.clientName}</td>
                    <td className="px-4 py-2.5">
                      <DealStatusBadge label={stageLabel} color={stageColor} />
                      {stageOutcome === "lost" && lossReasonLabel && (
                        <span className="block pt-0.5 text-xs text-muted-foreground">{lossReasonLabel}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                      {deal.estimatedAmount ? fmt.money(deal.estimatedAmount) : "—"}
                    </td>
                    <td className="hidden px-4 py-2.5 text-right tabular-nums text-muted-foreground md:table-cell">
                      {probability != null ? fmt.percent(probability) : "—"}
                    </td>
                    <td className={cn("px-4 py-2.5 tabular-nums", overdue && "font-medium text-destructive")} title={overdue ? t("cloture_depassee") : undefined}>
                      {deal.expectedCloseDate ? fmt.date(deal.expectedCloseDate) : "—"}
                    </td>
                    <td className="px-4 py-2.5 break-words">{ownerName ?? "—"}</td>
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
