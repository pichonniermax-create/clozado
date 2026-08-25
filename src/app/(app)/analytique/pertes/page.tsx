import Link from "next/link";
import type { ReactNode } from "react";
import { TrendingDown } from "lucide-react";
import { BreakdownTable, type BreakdownRow } from "@/components/analytics/breakdown-table";
import { dealsListHref } from "@/components/analytics/deals-list-href";
import { AnalyticsFiltersBar } from "@/components/analytics/filters-bar";
import { rateText } from "@/components/analytics/funnel-steps";
import { definitionAnchor, MetricDefinitions } from "@/components/analytics/metric-definitions";
import { periodPhrase } from "@/lib/metrics/period-phrase";
import { PageHeader } from "@/components/app-shell/page-header";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { listOrigins } from "@/db/queries/acquisition";
import { listOrgUsers } from "@/db/queries/contacts";
import { listDealTypes } from "@/db/queries/deal-types";
import { listPipelinesWithStages } from "@/db/queries/pipelines";
import { formatEuros } from "@/lib/format";
import {
  LOSS_NO_OWNER,
  lossesHasAnyData,
  lossesReport,
  METRICS,
  MIN_OBSERVATIONS,
  metricsOfFamily,
  parseMetricFilters,
  type DealSelectionParams,
  type LossBreakdownRow,
  type LossesReport,
  type MetricSearchParams,
  type ParsedMetricFilters,
} from "@/lib/metrics";
import { requireUser } from "@/lib/session";

const BASE_PATH = "/analytique/pertes";

function plural(n: number, singular: string, pluralForm = `${singular}s`) {
  return `${n} ${n > 1 ? pluralForm : singular}`;
}

function DefinitionLink({ id, children }: { id: keyof typeof METRICS; children: ReactNode }) {
  return (
    <a href={`#${definitionAnchor(METRICS[id])}`} className="underline-offset-2 hover:underline">
      {children}
    </a>
  );
}

/** L'état sans perte : une bonne nouvelle ou un pipeline pas tenu — l'inventaire le dit, avec les gestes. */
function NotEnoughData({ report, filtered }: { report: LossesReport; filtered: boolean }) {
  return (
    <EmptyState
      icon={<TrendingDown />}
      title={filtered ? "Aucune perte sur cette sélection" : "Aucune affaire perdue pour l'instant"}
      action={
        filtered ? (
          <Link href={BASE_PATH} className={buttonVariants({ variant: "outline" })}>
            Retirer les filtres
          </Link>
        ) : (
          <>
            <Link href="/affaires" className={buttonVariants({ variant: "outline" })}>
              Ouvrir le pipeline
            </Link>
            <Link href="/settings" className={buttonVariants({ variant: "ghost" })}>
              Configurer les motifs
            </Link>
          </>
        )
      }
    >
      {filtered
        ? "Aucune affaire perdue à cette date, pour ce conseiller, ce type, ce pipeline ou cette origine — élargis la période ou retire un filtre."
        : "Une perte se compte quand une affaire est déplacée dans l'étape marquée « perdu », avec son motif : c'est ce geste qui nourrit cet écran."}
      <span className="mt-3 block text-left">
        <span className="flex flex-col gap-1.5 text-xs">
          <span className="text-foreground">
            {METRICS.lost_deal.label} — <span className="tabular-nums">{report.total.n}</span>
            {report.excludedReconstructed.n > 0 && `, ${plural(report.excludedReconstructed.n, "perte antérieure au journal écartée (date inconnue)", "pertes antérieures au journal écartées (date inconnue)")}`}
          </span>
          {!filtered && <span>{METRICS.lost_deal.howToFeed}</span>}
          <span className="text-foreground">
            Gagnées sur la période — <span className="tabular-nums">{report.won}</span>
          </span>
        </span>
      </span>
    </EmptyState>
  );
}

function BreakdownSection({
  id,
  title,
  subtitle,
  labelHeader,
  rows,
  parsed,
  scopedPipelineId,
  link,
}: {
  id: keyof typeof METRICS;
  title: string;
  subtitle: string;
  labelHeader: string;
  rows: LossBreakdownRow[];
  parsed: ParsedMetricFilters;
  scopedPipelineId: string | null;
  /** Les paramètres de la liste pour une ligne — null quand la ligne n'a pas de liste (« sans responsable »). */
  link: (row: LossBreakdownRow) => Partial<DealSelectionParams> | null;
}) {
  const tableRows: BreakdownRow[] = rows.map((row) => {
    const over = scopedPipelineId ? link(row) : null;
    return {
      key: row.key,
      label: over ? (
        <Link href={dealsListHref(parsed, scopedPipelineId!, { cohorte: "perte", ...over })} className="underline-offset-2 hover:underline" title="Voir ces affaires">
          {row.label}
        </Link>
      ) : (
        row.label
      ),
      n: row.n,
      share: row.share,
      amount: row.amount,
      withoutAmount: row.withoutAmount,
    };
  });
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">
        <DefinitionLink id={id}>{title}</DefinitionLink>
      </h2>
      <p className="-mt-1 text-xs text-muted-foreground text-pretty">{subtitle}</p>
      {tableRows.length === 0 ? (
        <EmptyState>Rien à répartir sur cette sélection.</EmptyState>
      ) : (
        <BreakdownTable rows={tableRows} labelHeader={labelHeader} amountHeader="Montant perdu" />
      )}
    </section>
  );
}

export default async function LossesPage({ searchParams }: { searchParams: Promise<MetricSearchParams> }) {
  const user = await requireUser();
  const raw = await searchParams;

  const header = (
    <PageHeader
      title="Analyse des pertes"
      description="Pourquoi les affaires se perdent — par motif, par étape de départ, par conseiller, par type — et combien ça coûte. Chaque ligne ouvre la liste des affaires qu'elle compte."
    />
  );

  if (!user.organizationId) {
    return (
      <>
        {header}
        <EmptyState title="Tu es en vue globale">
          Choisis une organisation dans le bandeau super admin en haut de l&apos;écran pour voir ses pertes — un agrégat ne
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
    lossesReport(user, parsed.filters),
  ]);
  const scopedPipelineId = parsed.filters.pipelineId ?? (pipelines.length === 1 ? pipelines[0].id : null);
  const hasData = lossesHasAnyData(report);
  const period = periodPhrase(parsed);

  const totalLabel = <span className="tabular-nums">{plural(report.total.n, "affaire perdue", "affaires perdues")}</span>;

  return (
    <>
      {header}
      <AnalyticsFiltersBar basePath={BASE_PATH} parsed={parsed} users={users} types={types} pipelines={pipelines} origins={origins} exportView="pertes" />

      {!hasData ? (
        <NotEnoughData report={report} filtered={parsed.active} />
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">
              <DefinitionLink id="lost_deal">Sur la période</DefinitionLink>
            </h2>
            <p className="text-sm text-pretty">
              {scopedPipelineId ? (
                <Link href={dealsListHref(parsed, scopedPipelineId, { cohorte: "perte" })} className="font-medium underline-offset-2 hover:underline">
                  {totalLabel}
                </Link>
              ) : (
                <span className="font-medium">{totalLabel}</span>
              )}{" "}
              {period},{" "}
              {report.total.withoutAmount === report.total.n ? (
                <>
                  montant estimé perdu inconnu <span className="text-muted-foreground">({report.total.n} sans montant)</span>
                </>
              ) : (
                <>
                  <span className="tabular-nums">{formatEuros(report.total.amount)}</span> de montant estimé perdu
                  {report.total.withoutAmount > 0 && (
                    <span className="text-muted-foreground"> ({report.total.withoutAmount} sans montant)</span>
                  )}
                </>
              )}
              {" · "}
              <span className="tabular-nums">{plural(report.won, "gagnée")}</span> sur la même période{" · "}
              <DefinitionLink id="loss_rate">taux de perte</DefinitionLink> <span className="tabular-nums">{rateText(report.lossRate, true)}</span>
              {report.lossRate.hidden && (
                <span className="text-muted-foreground"> (masqué : il manque {report.lossRate.missing} affaire{report.lossRate.missing > 1 ? "s" : ""} close{report.lossRate.missing > 1 ? "s" : ""})</span>
              )}
              .
            </p>
            {report.excludedReconstructed.n > 0 && (
              <p className="-mt-1 text-xs text-muted-foreground text-pretty">
                {plural(report.excludedReconstructed.n, "perte antérieure au journal écartée", "pertes antérieures au journal écartées")} (date de la
                perte inconnue),{" "}
                {report.excludedReconstructed.withoutAmount === report.excludedReconstructed.n ? (
                  "montant inconnu"
                ) : (
                  <>
                    <span className="tabular-nums">{formatEuros(report.excludedReconstructed.amount)}</span>
                    {report.excludedReconstructed.withoutAmount > 0 && ` (${report.excludedReconstructed.withoutAmount} sans montant)`}
                  </>
                )}{" "}
                — jamais datées par une valeur plausible.
              </p>
            )}
            {!scopedPipelineId && (
              <p className="-mt-1 text-xs text-muted-foreground">Filtre sur un pipeline pour ouvrir la liste des affaires de chaque ligne.</p>
            )}
          </section>

          <BreakdownSection
            id="loss_breakdown"
            title="Par motif"
            subtitle="Le motif au moment de la perte — pas la valeur courante de la fiche. « Sans motif » : perdue sans motif choisi."
            labelHeader="Motif"
            rows={report.byReason}
            parsed={parsed}
            scopedPipelineId={scopedPipelineId}
            link={(row) => ({ motif: row.key })}
          />
          <BreakdownSection
            id="loss_breakdown"
            title="Par étape de départ"
            subtitle="L'étape d'où l'affaire est tombée. « Dès la création » : née perdue."
            labelHeader="Étape"
            rows={report.byStage}
            parsed={parsed}
            scopedPipelineId={scopedPipelineId}
            link={(row) => ({ depuis: row.key })}
          />
          <BreakdownSection
            id="loss_breakdown"
            title="Par conseiller"
            subtitle="Le responsable de l'affaire aujourd'hui (les réaffectations ne sont pas historisées)."
            labelHeader="Conseiller"
            rows={report.byOwner}
            parsed={parsed}
            scopedPipelineId={scopedPipelineId}
            link={(row) => (row.key === LOSS_NO_OWNER ? null : { conseiller: row.key })}
          />
          <BreakdownSection
            id="loss_breakdown"
            title="Par type d'affaire"
            subtitle="Le type de l'affaire aujourd'hui."
            labelHeader="Type"
            rows={report.byType}
            parsed={parsed}
            scopedPipelineId={scopedPipelineId}
            link={(row) => ({ type: row.key })}
          />
        </>
      )}

      <MetricDefinitions metrics={metricsOfFamily("losses")} />

      <p className="text-xs text-muted-foreground text-pretty">
        Une part calculée sur moins de {MIN_OBSERVATIONS} pertes est masquée ; nombres et montants s&apos;affichent toujours. Les motifs se
        configurent dans{" "}
        <Link href="/settings" className="underline underline-offset-2 hover:text-foreground">
          Marque &amp; réglages
        </Link>
        ; le funnel montre depuis quelle étape les affaires se perdent, en volume, dans{" "}
        <Link href="/analytique/funnel" className="underline underline-offset-2 hover:text-foreground">
          Analytique → Funnel
        </Link>
        .
      </p>
    </>
  );
}
