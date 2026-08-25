import Link from "next/link";
import type { ReactNode } from "react";
import { Funnel } from "lucide-react";
import { dealsListHref } from "@/components/analytics/deals-list-href";
import { AnalyticsFiltersBar } from "@/components/analytics/filters-bar";
import { CountCell, FunnelSteps, RATE_THRESHOLD_NOTE, rateText, type FunnelRow } from "@/components/analytics/funnel-steps";
import { definitionAnchor, MetricDefinitions } from "@/components/analytics/metric-definitions";
import { periodPhrase } from "@/lib/metrics/period-phrase";
import { PageHeader } from "@/components/app-shell/page-header";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { listOrigins } from "@/db/queries/acquisition";
import { listOrgUsers } from "@/db/queries/contacts";
import { listDealTypes } from "@/db/queries/deal-types";
import { listPipelinesWithStages } from "@/db/queries/pipelines";
import {
  funnelHasAnyData,
  funnelReport,
  METRICS,
  metricQueryString,
  metricsOfFamily,
  parseMetricFilters,
  type DealSelectionParams,
  type FunnelChain,
  type FunnelReport,
  type MetricSearchParams,
  type OriginFunnelRow,
  type ParsedMetricFilters,
  type PipelineFunnel,
} from "@/lib/metrics";
import { requireUser } from "@/lib/session";

const BASE_PATH = "/analytique/funnel";

function plural(n: number, singular: string, pluralForm = `${singular}s`) {
  return `${n} ${n > 1 ? pluralForm : singular}`;
}

const listHref = dealsListHref;

function DefinitionLink({ id, children }: { id: keyof typeof METRICS; children: ReactNode }) {
  return (
    <a href={`#${definitionAnchor(METRICS[id])}`} className="underline-offset-2 hover:underline">
      {children}
    </a>
  );
}

function ListLink({ href, children, title }: { href: string; children: ReactNode; title?: string }) {
  return (
    <Link href={href} className="underline-offset-2 hover:underline" title={title ?? "Voir la liste de ces affaires"}>
      {children}
    </Link>
  );
}

function SettingsLink({ children }: { children: ReactNode }) {
  return (
    <Link href="/settings" className="underline underline-offset-2 hover:text-foreground">
      {children}
    </Link>
  );
}

/**
 * L'état « pas encore assez de données » : l'inventaire de ce que chaque
 * pas compte aujourd'hui (rien, ou pourquoi il est sans objet) et le geste
 * qui crée une observation — jamais un écran vide. Le même bloc quand des
 * filtres ne laissent rien passer, avec le geste inverse en tête.
 */
function NotEnoughData({ report, filtered }: { report: FunnelReport; filtered: boolean }) {
  return (
    <EmptyState
      icon={<Funnel />}
      title={filtered ? "Rien ne se compte avec ces filtres" : "Pas encore de quoi dessiner le funnel"}
      action={
        filtered ? (
          <Link href={BASE_PATH} className={buttonVariants({ variant: "outline" })}>
            Retirer les filtres
          </Link>
        ) : (
          <>
            <Link href="/affaires?nouveau=1" className={buttonVariants({ variant: "outline" })}>
              Créer une affaire
            </Link>
            <Link href="/settings" className={buttonVariants({ variant: "ghost" })}>
              Brancher la collecte
            </Link>
          </>
        )
      }
    >
      {filtered
        ? "Aucun pas ne compte quoi que ce soit sur cette sélection — élargis la période ou retire un filtre."
        : "Le funnel se dessine avec les visites, les leads et les affaires : voici ce que chaque pas attend."}
      <span className="mt-3 block text-left">
        <span className="flex flex-col gap-1.5 text-xs">
          {report.chain.steps.map(({ metric, count }) => (
            <span key={metric.id} className="flex flex-col gap-0.5">
              <span className="text-foreground">
                {metric.label} —{" "}
                {count.unavailable ? <span className="text-muted-foreground">{count.unavailable}</span> : <span className="tabular-nums">{count.n}</span>}
              </span>
              {!filtered && <span>{metric.howToFeed}</span>}
            </span>
          ))}
          {report.pipelines.map((p) => (
            <span key={p.pipelineId} className="text-foreground">
              {p.label} — <span className="tabular-nums">{plural(p.created, "affaire créée", "affaires créées")}</span>
            </span>
          ))}
        </span>
      </span>
    </EmptyState>
  );
}

/** Les mentions sous un pas de la chaîne — ce qui manque au pas suivant, ce qui est en cours, et les pipelines où les affaires vivent. */
function chainNote(
  chain: FunnelChain,
  metricId: string,
  parsed: ParsedMetricFilters,
  scopedPipelineId: string | null
): ReactNode {
  const step = chain.steps.find((s) => s.metric.id === metricId)!;
  const over = step.rate && step.rate.percent !== null && step.rate.percent > 100;
  switch (metricId) {
    case "funnel_visitors":
      return !chain.collection.everEvents ? (
        <>
          Les visites ne sont pas encore mesurées : <SettingsLink>poser l&apos;extrait</SettingsLink> sur le site.
        </>
      ) : undefined;
    case "funnel_leads":
      if (!chain.collection.everLeads) {
        return (
          <>
            Aucun lead reçu : <SettingsLink>brancher l&apos;entrée des leads</SettingsLink> (clé d&apos;API).
          </>
        );
      }
      return over ? "plus de leads que de simulations terminées mesurées : des leads arrivent sans passer par l'extrait" : undefined;
    case "funnel_contacted":
      return chain.leadsPending > 0
        ? plural(chain.leadsPending, "lead sans premier contact consigné", "leads sans premier contact consigné")
        : undefined;
    case "funnel_deals_from_leads": {
      const parts: ReactNode[] = [];
      if (over) parts.push("plus d'affaires que de contacts établis : des interactions ne sont pas consignées");
      if (!scopedPipelineId && chain.deals.byPipeline.length > 0) {
        parts.push(
          <>
            par pipeline :{" "}
            {chain.deals.byPipeline.map((p, i) => (
              <span key={p.pipelineId}>
                {i > 0 && " · "}
                <ListLink href={listHref(parsed, p.pipelineId, { cohorte: "lead" })}>
                  {p.label} <span className="tabular-nums">{p.n}</span>
                </ListLink>
              </span>
            ))}
          </>
        );
      }
      return parts.length ? parts.map((p, i) => <span key={i}>{i > 0 && " · "}{p}</span>) : undefined;
    }
    case "funnel_won": {
      if (step.count.unavailable) return undefined;
      const lost = plural(chain.deals.lost, "perdue");
      const open = plural(chain.deals.open, "en cours", "en cours");
      if (!scopedPipelineId) return `${lost} · ${open}`;
      return (
        <>
          <ListLink href={listHref(parsed, scopedPipelineId, { cohorte: "lead", issue: "perdue" })}>{lost}</ListLink>
          {" · "}
          <ListLink href={listHref(parsed, scopedPipelineId, { cohorte: "lead", issue: "en-cours" })}>{open}</ListLink>
        </>
      );
    }
    default:
      return undefined;
  }
}

function ChainSection({ report, parsed, scopedPipelineId }: { report: FunnelReport; parsed: ParsedMetricFilters; scopedPipelineId: string | null }) {
  const { chain } = report;
  const rows: FunnelRow[] = chain.steps.map((step) => {
    const id = step.metric.id as keyof typeof METRICS;
    let label: ReactNode = <DefinitionLink id={id}>{step.metric.label}</DefinitionLink>;
    if (scopedPipelineId && !step.count.unavailable && id === "funnel_deals_from_leads") {
      label = <ListLink href={listHref(parsed, scopedPipelineId, { cohorte: "lead" })}>{step.metric.label}</ListLink>;
    }
    if (scopedPipelineId && !step.count.unavailable && id === "funnel_won") {
      label = <ListLink href={listHref(parsed, scopedPipelineId, { cohorte: "lead", issue: "gagnee" })}>{step.metric.label}</ListLink>;
    }
    return { key: id, label, count: step.count, rate: step.rate, note: chainNote(chain, id, parsed, scopedPipelineId) };
  });
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">La chaîne — de la visite à la signature</h2>
      <p className="-mt-1 text-xs text-muted-foreground text-pretty">
        Les trois premiers pas comptent des navigateurs (identifiant anonyme, {periodPhrase(parsed)}) ; à partir du lead, des
        personnes et des affaires — les leads reçus {periodPhrase(parsed)}, suivis jusqu&apos;à aujourd&apos;hui. Le libellé d&apos;un pas
        d&apos;affaires ouvre la liste de ce qu&apos;il compte.
      </p>
      <FunnelSteps rows={rows} />
    </section>
  );
}

function StageDot({ color }: { color: string | null }) {
  return <span aria-hidden className="mr-2 inline-block size-2.5 shrink-0 rounded-full align-middle" style={{ backgroundColor: color ?? "var(--muted-foreground)" }} />;
}

function PipelineSection({ funnel, parsed, single }: { funnel: PipelineFunnel; parsed: ParsedMetricFilters; single: boolean }) {
  const href = (over: Partial<DealSelectionParams> = {}) => listHref(parsed, funnel.pipelineId, over);
  const prefix = single ? "" : `${funnel.label} — `;
  const rows: FunnelRow[] = funnel.stages.map((s) => {
    const parts: ReactNode[] = [];
    if (s.lostHere > 0) {
      parts.push(
        <ListLink key="lost" href={href({ jusqua: s.stageId, issue: "perdue" })}>
          {plural(s.lostHere, "perdue")} depuis cette étape
        </ListLink>
      );
    }
    if (s.openHere > 0) {
      parts.push(
        <ListLink key="open" href={href({ jusqua: s.stageId, issue: "en-cours" })}>
          {plural(s.openHere, "en cours", "en cours")}, au plus loin ici
        </ListLink>
      );
    }
    return {
      key: s.stageId,
      label: (
        <ListLink href={href({ atteint: s.stageId })} title="Voir les affaires qui ont atteint cette étape">
          <StageDot color={s.color} />
          {s.label}
        </ListLink>
      ),
      count: { n: s.reached },
      rate: s.rate,
      note: parts.length ? parts.map((p, i) => <span key={i}>{i > 0 && " · "}{p}</span>) : undefined,
    };
  });
  rows.push({
    key: "won",
    label: <ListLink href={href({ issue: "gagnee" })}>Gagnées</ListLink>,
    count: { n: funnel.won },
    rate: funnel.wonRate,
    note: (
      <>
        <ListLink href={href({ issue: "perdue" })}>{plural(funnel.lost, "perdue")} au total</ListLink>
        {" · "}
        <ListLink href={href({ issue: "en-cours" })}>{plural(funnel.open, "en cours", "en cours")}</ListLink>
      </>
    ),
  });

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">
        {prefix}
        <DefinitionLink id="funnel_stage_reached">{single ? "Par étape du pipeline" : "par étape"}</DefinitionLink>
      </h2>
      <p className="-mt-1 text-xs text-muted-foreground text-pretty">
        <ListLink href={href()}>
          <span className="tabular-nums">{plural(funnel.created, "affaire créée", "affaires créées")}</span> {periodPhrase(parsed)}
        </ListLink>
        {funnel.created > 0 && (
          <>
            , dont <span className="tabular-nums">{funnel.createdFromLead}</span> issue{funnel.createdFromLead > 1 ? "s" : ""} d&apos;un lead
          </>
        )}
        . Chaque étape compte les affaires allées au moins jusque-là ; la déperdition d&apos;une étape, ce sont ses perdues et ses en cours.
      </p>
      {funnel.created === 0 ? (
        <EmptyState>Aucune affaire créée dans ce pipeline {periodPhrase(parsed)} — rien à faire avancer encore.</EmptyState>
      ) : (
        <FunnelSteps rows={rows} labelHeader="Étape" />
      )}
    </section>
  );
}

function OriginsSection({ rows, parsed }: { rows: OriginFunnelRow[]; parsed: ParsedMetricFilters }) {
  const header = (label: string, align: "left" | "right" = "right") => (
    <th scope="col" className={`px-3 py-2.5 font-medium ${align === "right" ? "text-right" : "text-left"}`}>
      {label}
    </th>
  );
  const cell = (content: ReactNode) => <td className="px-3 py-3 text-right align-top tabular-nums">{content}</td>;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">
        <DefinitionLink id="funnel_by_origin">Par origine — laquelle génère des affaires qui se signent</DefinitionLink>
      </h2>
      <p className="-mt-1 text-xs text-muted-foreground text-pretty">
        Les mêmes pas que la chaîne, groupés par l&apos;origine transmise par la page ou le lead. Le libellé d&apos;une origine
        filtre tout l&apos;écran dessus ; un taux « — » est masqué faute d&apos;observations au pas précédent.
        {parsed.filters.ownerId && " Visites et simulations : sans objet par conseiller."}
      </p>
      {rows.length === 0 ? (
        <EmptyState
          title="Aucune origine pour l'instant"
          action={
            <Link href="/analytique/origines" className={buttonVariants({ variant: "outline" })}>
              Configurer les origines
            </Link>
          }
        >
          Une origine = un simulateur, une page, une campagne. Configure-les et transmets leur libellé dans l&apos;extrait et dans
          /api/leads : chaque ligne dira alors ce qu&apos;elle rapporte.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[64rem] text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                {header("Origine", "left")}
                {header("Visiteurs")}
                {header("Sim. démarrées")}
                {header("Sim. terminées")}
                {header("Leads")}
                {header("Contacts établis")}
                {header("Affaires")}
                {header("Gagnées")}
                {header("Lead → affaire")}
                {header("Affaire → gagnée")}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row" className="px-3 py-3 text-left font-medium align-top">
                    <Link
                      href={`${BASE_PATH}${metricQueryString(parsed.params, { origine: row.key })}`}
                      className="underline-offset-2 hover:underline"
                      title="Filtrer l'écran sur cette origine"
                    >
                      {row.label}
                    </Link>
                  </th>
                  {cell(<CountCell count={row.visitors} />)}
                  {cell(<CountCell count={row.started} />)}
                  {cell(<CountCell count={row.completed} />)}
                  {cell(<CountCell count={row.leads} />)}
                  {cell(<CountCell count={row.contacted} />)}
                  {cell(<CountCell count={row.deals} />)}
                  {cell(<CountCell count={row.won} />)}
                  {cell(rateText(row.leadToDeal, true))}
                  {cell(rateText(row.dealToWon, true))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function FunnelPage({ searchParams }: { searchParams: Promise<MetricSearchParams> }) {
  const user = await requireUser();
  const raw = await searchParams;

  const header = (
    <PageHeader
      title="Funnel de conversion"
      description="Une seule chaîne, de la visite à la signature : combien passent chaque pas, combien se perdent, et depuis quelle origine. Chaque pas d'affaires ouvre la liste de ce qu'il compte."
    />
  );

  if (!user.organizationId) {
    return (
      <>
        {header}
        <EmptyState title="Tu es en vue globale">
          Choisis une organisation dans le bandeau super admin en haut de l&apos;écran pour voir son funnel — un agrégat ne
          traverse jamais la frontière entre deux organisations.
        </EmptyState>
      </>
    );
  }

  const parsed = parseMetricFilters(raw);
  const [pipelines, types, users, origins, report] = await Promise.all([
    listPipelinesWithStages(user),
    listDealTypes(user),
    listOrgUsers(user),
    listOrigins(user),
    funnelReport(user, parsed.filters),
  ]);

  // Un seul pipeline en jeu (l'organisation n'en a qu'un, ou le filtre en choisit un) : les pas d'affaires de la chaîne ouvrent sa liste.
  const scopedPipelineId = parsed.filters.pipelineId ?? (pipelines.length === 1 ? pipelines[0].id : null);
  const hasData = funnelHasAnyData(report);

  return (
    <>
      {header}
      <AnalyticsFiltersBar basePath={BASE_PATH} parsed={parsed} users={users} types={types} pipelines={pipelines} origins={origins} exportView="funnel" />

      {!hasData ? (
        <NotEnoughData report={report} filtered={parsed.active} />
      ) : (
        <>
          <ChainSection report={report} parsed={parsed} scopedPipelineId={scopedPipelineId} />
          {report.pipelines.map((p) => (
            <PipelineSection key={p.pipelineId} funnel={p} parsed={parsed} single={report.pipelines.length === 1} />
          ))}
          <OriginsSection rows={report.origins} parsed={parsed} />
        </>
      )}

      <MetricDefinitions metrics={metricsOfFamily("funnel")} />

      <p className="text-xs text-muted-foreground text-pretty">
        {RATE_THRESHOLD_NOTE} Le funnel se calcule à la volée sur le journal de ton organisation : la chaîne suit les leads
        reçus dans la période, le funnel d&apos;un pipeline suit les affaires créées dans la période — jusqu&apos;à aujourd&apos;hui
        dans les deux cas. Les délais se lisent dans{" "}
        <Link href="/analytique/delais" className="underline underline-offset-2 hover:text-foreground">
          Analytique → Délais
        </Link>
        , les origines se rapprochent dans{" "}
        <Link href="/analytique/origines" className="underline underline-offset-2 hover:text-foreground">
          Analytique → Origines
        </Link>
        .
      </p>
    </>
  );
}
