import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDown, ArrowUp, Columns3, Rows3 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DealStatusBadge } from "@/components/deals/deal-status-badge";
import { DetailsCard } from "@/components/ui/details-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
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
import { formatDate, formatEuros, formatPercent } from "@/lib/format";
import { metricQueryString, parseDealSelection, type DealSelectionParams, type ParsedDealSelection } from "@/lib/metrics";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

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
  if (!label) return;
  await createDealTypeAction(label);
  redirect("/affaires");
}

export default async function DealsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  const params = await searchParams;
  // Une sélection analytique n'a de sens qu'en liste : le kanban ne filtre pas.
  const sel = parseDealSelection(params);
  const vue = params.vue === "liste" || sel.analytic ? "liste" : "kanban";

  if (sel.analytic && !user.organizationId) {
    return (
      <>
        <PageHeader title="Affaires" description="Les dossiers que tu suis, du premier contact à la signature." />
        <EmptyState title="Tu es en vue globale">
          Cette sélection vient du funnel d&apos;une organisation : choisis-la dans le bandeau super admin en haut de
          l&apos;écran pour voir ses affaires.
        </EmptyState>
      </>
    );
  }

  const [pipelines, types, orgUsers, lossReasons, origins] = await Promise.all([
    listPipelinesWithStages(user),
    listDealTypes(user),
    listOrgUsers(user),
    listLossReasons(user),
    sel.analytic ? listOrigins(user) : Promise.resolve([]),
  ]);

  if (pipelines.length === 0) {
    return (
      <>
        <PageHeader title="Affaires" description="Les dossiers que tu suis, du premier contact à la signature." />
        {user.organizationId ? (
          <EmptyState
            title="Aucun pipeline dans cette organisation"
            action={
              <Link href="/settings" className={buttonVariants({ variant: "outline" })}>
                Configurer un pipeline
              </Link>
            }
          >
            Un pipeline est une famille d&apos;affaires avec ses propres étapes (crédit, placement,
            transaction…). Il se crée depuis Marque &amp; réglages.
          </EmptyState>
        ) : (
          <EmptyState title="Tu es en vue globale">
            Choisis une organisation dans le bandeau super admin en haut de l&apos;écran pour voir
            son pipeline.
          </EmptyState>
        )}
      </>
    );
  }

  const pipeline = pipelines.find((p) => p.id === params.pipeline) ?? pipelines[0];
  const stages = pipeline.stages;
  const prefillContact = params.contact
    ? await getContact(user, params.contact).catch(() => null)
    : null;

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
    const statusId = String(formData.get("statusId") ?? "").trim() || undefined;
    if (!title || !typeId || (!clientName && !contactId)) return;

    const rawAmount = String(formData.get("estimatedAmount") ?? "").trim();
    await createDealAction({
      title,
      clientName,
      typeId,
      statusId,
      contactId,
      estimatedAmount: rawAmount || null,
      description: String(formData.get("description") ?? "").trim() || null,
    });
    redirect(`/affaires?vue=${formData.get("vue")}&pipeline=${formData.get("pipelineId")}`);
  }

  return (
    <>
      <PageHeader
        title="Affaires"
        description="Les dossiers que tu suis — le kanban pour piloter, la liste pour travailler. Chaque affaire se partage à un confrère sans ressaisie."
        actions={
          <div className="flex rounded-lg border border-border p-0.5">
            <Link
              href={baseQuery({ vue: "kanban", page: undefined, ...clearSelection })}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors",
                vue === "kanban" ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              aria-current={vue === "kanban" ? "page" : undefined}
            >
              <Columns3 className="size-4" />
              Kanban
            </Link>
            <Link
              href={baseQuery({ vue: "liste", page: undefined })}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors",
                vue === "liste" ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:text-foreground"
              )}
              aria-current={vue === "liste" ? "page" : undefined}
            >
              <Rows3 className="size-4" />
              Liste
            </Link>
          </div>
        }
      />

      {pipelines.length > 1 && (
        <nav className="flex flex-wrap gap-1 border-b border-border" aria-label="Pipelines">
          {pipelines.map((p) => (
            <Link
              key={p.id}
              href={`/affaires?vue=${vue}&pipeline=${p.id}`}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
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
            <CardTitle>Configure au moins un type d&apos;affaire</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">
              Ton organisation n&apos;a pas encore de type d&apos;affaire (ex : « Crédit
              immobilier », « Assurance-vie »). Il en faut au moins un pour créer une affaire —
              tu pourras en ajouter d&apos;autres ensuite.
            </p>
            <form action={addDealType} className="flex items-end gap-2">
              <Field label="Nom du type" htmlFor="typeLabel" className="flex-1">
                <Input id="typeLabel" name="typeLabel" required />
              </Field>
              <Button type="submit">Ajouter</Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <DetailsCard
          summary={
            prefillContact ? `Nouvelle affaire pour ${prefillContact.name}` : "Nouvelle affaire"
          }
          // Déplié quand on vient pour créer : depuis une fiche contact, ou
          // depuis un état vide (« Créer une affaire »).
          defaultOpen={Boolean(prefillContact) || params.nouveau === "1"}
        >
          <form action={addDeal} className="flex flex-col gap-4">
            <input type="hidden" name="vue" value={vue} />
            <input type="hidden" name="pipelineId" value={pipeline.id} />
            {/* L'affaire naît dans le pipeline affiché, à sa première étape. */}
            <input type="hidden" name="statusId" value={stages[0]?.id ?? ""} />
            {prefillContact && (
              <input type="hidden" name="contactId" value={prefillContact.id} />
            )}
            {prefillContact && (
              <p className="text-sm text-muted-foreground">
                Cette affaire sera reliée à la fiche{" "}
                <span className="font-medium text-foreground">{prefillContact.name}</span>.
              </p>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Libellé" htmlFor="title">
                <Input id="title" name="title" placeholder="Financement appartement Lyon" required />
              </Field>
              <Field label="Client concerné" htmlFor="clientName">
                <Input
                  id="clientName"
                  name="clientName"
                  placeholder="M. et Mme Perrin"
                  defaultValue={prefillContact?.name ?? ""}
                  required={!prefillContact}
                />
              </Field>
              <Field label="Type" htmlFor="typeId">
                <Select
                  name="typeId"
                  // Voir la note dans partner-share-view.tsx : sans `items`,
                  // le déclencheur affiche l'UUID au lieu du libellé.
                  items={types.map((t) => ({ label: t.label, value: t.id }))}
                >
                  <SelectTrigger id="typeId" className="w-full">
                    <SelectValue placeholder="Choisir un type" />
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
              <Field label="Montant estimé (€)" htmlFor="estimatedAmount">
                <Input id="estimatedAmount" name="estimatedAmount" type="number" min="0" />
              </Field>
            </div>
            <Field label="Description" htmlFor="description">
              <Textarea id="description" name="description" className="min-h-16" />
            </Field>
            <Button type="submit" className="w-fit">
              Créer l&apos;affaire
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
  const cards = await listDealsBoard(user, pipelineId);
  return (
    <>
      {cards.length === 0 && (
        <EmptyState
          title="Aucune affaire dans ce pipeline pour l'instant"
          action={
            <Link
              href={`/affaires?vue=kanban&pipeline=${pipelineId}&nouveau=1`}
              className={buttonVariants({ variant: "outline" })}
            >
              Créer une affaire
            </Link>
          }
        >
          Chaque colonne est une étape ; une affaire se glisse de l&apos;une à l&apos;autre et se
          partage à un confrère depuis sa fiche. La première naîtra dans la colonne de gauche.
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
  params: Params;
  sel: ParsedDealSelection;
  baseQuery: (over: Record<string, string | undefined>) => string;
}) {
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

  return (
    <section className="flex flex-col gap-3">
      {sel.analytic && (
        <DealSelectionBanner
          description={describeDealSelection(sel, { stages, types, origins, users: orgUsers })}
          total={total}
          clearHref={`/affaires?vue=liste&pipeline=${pipelineId}`}
          funnelHref={`/analytique/funnel${metricQueryString(sel.parsed.params)}`}
        />
      )}
      <form method="get" className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="vue" value="liste" />
        <input type="hidden" name="pipeline" value={pipelineId} />
        {Object.entries(selectionParams).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
        <select
          name="etape"
          defaultValue={params.etape ?? ""}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          aria-label="Filtrer par étape"
        >
          <option value="">Toutes les étapes</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        {orgUsers.length > 1 && (
          <select
            name="conseiller"
            defaultValue={sel.parsed.filters.ownerId ?? ""}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            aria-label="Filtrer par conseiller"
          >
            <option value="">Tous les conseillers</option>
            {orgUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name || u.email}
              </option>
            ))}
          </select>
        )}
        <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Filtrer
        </button>
        <span className="ml-auto text-sm tabular-nums text-muted-foreground">
          {total} affaire{total > 1 ? "s" : ""}
        </span>
      </form>

      {rows.length === 0 ? (
        sel.analytic ? (
          <EmptyState
            title="Aucune affaire dans cette sélection"
            action={
              <Link href={`/affaires?vue=liste&pipeline=${pipelineId}`} className={buttonVariants({ variant: "outline" })}>
                Retirer la sélection
              </Link>
            }
          >
            Le funnel compte zéro affaire ici — ou bien un filtre natif de la liste (étape, conseiller) s&apos;y ajoute et
            ne laisse rien passer.
          </EmptyState>
        ) : params.etape || sel.parsed.filters.ownerId ? (
          <EmptyState
            title="Aucune affaire ne correspond à ces filtres"
            action={
              <Link
                href={`/affaires?vue=liste&pipeline=${pipelineId}`}
                className={buttonVariants({ variant: "outline" })}
              >
                Retirer les filtres
              </Link>
            }
          >
            Étape et conseiller se combinent : élargis l&apos;un des deux.
          </EmptyState>
        ) : (
          <EmptyState
            title="Aucune affaire dans ce pipeline pour l'instant"
            action={
              <Link
                href={`/affaires?vue=liste&pipeline=${pipelineId}&nouveau=1`}
                className={buttonVariants({ variant: "outline" })}
              >
                Créer une affaire
              </Link>
            }
          >
            La liste est faite pour travailler : triable, filtrable, paginée. Elle se remplira avec
            la première affaire.
          </EmptyState>
        )
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">{sortLink("title", "Affaire")}</th>
                <th className="px-4 py-2 font-medium">Client</th>
                <th className="px-4 py-2 font-medium">{sortLink("stage", "Étape")}</th>
                <th className="px-4 py-2 text-right font-medium">{sortLink("amount", "Montant")}</th>
                <th className="px-4 py-2 text-right font-medium">Prob.</th>
                <th className="px-4 py-2 font-medium">{sortLink("close", "Clôture prévue")}</th>
                <th className="px-4 py-2 font-medium">Responsable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(({ deal, stageLabel, stageColor, stageProbability, stageOutcome, typeLabel, ownerName, lossReasonLabel }) => {
                const probability = deal.probability ?? stageProbability;
                return (
                  <tr key={deal.id} className="transition-colors hover:bg-accent/40">
                    <td className="max-w-64 px-4 py-2.5">
                      <Link href={`/affaires/${deal.id}`} className="font-medium hover:underline">
                        {deal.title}
                      </Link>
                      <span className="block truncate text-xs text-muted-foreground">{typeLabel}</span>
                    </td>
                    <td className="max-w-40 truncate px-4 py-2.5">{deal.clientName}</td>
                    <td className="px-4 py-2.5">
                      <DealStatusBadge label={stageLabel} color={stageColor} />
                      {stageOutcome === "lost" && lossReasonLabel && (
                        <span className="block pt-0.5 text-xs text-muted-foreground">{lossReasonLabel}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                      {deal.estimatedAmount ? formatEuros(deal.estimatedAmount) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                      {probability != null ? formatPercent(probability) : "—"}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {deal.expectedCloseDate ? formatDate(deal.expectedCloseDate) : "—"}
                    </td>
                    <td className="max-w-32 truncate px-4 py-2.5">{ownerName ?? "—"}</td>
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
              ← Précédentes
            </Link>
          ) : (
            <span />
          )}
          <span className="tabular-nums text-muted-foreground">
            Page {page} sur {pageCount} · {DEALS_PAGE_SIZE} par page
          </span>
          {page < pageCount ? (
            <Link href={baseQuery({ page: String(page + 1) })} className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Suivantes →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </section>
  );
}
