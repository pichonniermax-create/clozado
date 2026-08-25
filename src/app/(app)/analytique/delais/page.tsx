import Link from "next/link";
import type { ReactNode } from "react";
import { Timer } from "lucide-react";
import { AnalyticsFiltersBar } from "@/components/analytics/filters-bar";
import { DurationTable, statNotes, type DurationRow } from "@/components/analytics/duration-table";
import { definitionAnchor, MetricDefinitions } from "@/components/analytics/metric-definitions";
import { PageHeader } from "@/components/app-shell/page-header";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { listOrigins } from "@/db/queries/acquisition";
import { listOrgUsers } from "@/db/queries/contacts";
import { listDealTypes } from "@/db/queries/deal-types";
import { listPipelinesWithStages, type PipelineWithStages } from "@/db/queries/pipelines";
import {
  delaysReport,
  METRICS,
  metricsOfFamily,
  MIN_OBSERVATIONS,
  parseMetricFilters,
  reportShowsAnything,
  type DelaysReport,
  type MetricSearchParams,
} from "@/lib/metrics";
import { requireUser } from "@/lib/session";

const BASE_PATH = "/analytique/delais";

/** Les mots des mentions sous chaque indicateur — la règle d'assemblage vit dans `statNotes`. */
const CYCLE_WORDS = {
  lead_to_first_contact: {
    pending: ["contact venu par un lead sans premier contact consigné", "contacts venus par un lead sans premier contact consigné"],
  },
  commission_settlement_delay: {
    unknown: [
      "commission réglée écartée (date de confirmation inconnue)",
      "commissions réglées écartées (date de confirmation inconnue)",
    ],
  },
} as const;

const STAGE_WORDS = {
  pending: ["affaire dans l'étape aujourd'hui", "affaires dans l'étape aujourd'hui"],
  reconstructed: ["passage reconstitué écarté", "passages reconstitués écartés"],
} as const;

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

function StageLabel({ stage }: { stage: { pipelineId: string; stageId: string; label: string; color: string | null } }) {
  return (
    <Link
      href={`/affaires?vue=liste&pipeline=${stage.pipelineId}&etape=${stage.stageId}`}
      className="inline-flex items-center gap-2 underline-offset-2 hover:underline"
      title="Voir les affaires actuellement dans cette étape"
    >
      <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: stage.color ?? "var(--muted-foreground)" }} />
      {stage.label}
    </Link>
  );
}

/**
 * L'état « pas encore assez de données » : pas un écran vide, l'inventaire
 * de ce qui existe déjà et de ce qui crée une observation, indicateur par
 * indicateur. Le même bloc sert quand des filtres ne laissent rien passer
 * — avec le geste inverse (élargir) en tête.
 */
function NotEnoughData({ report, filtered }: { report: DelaysReport; filtered: boolean }) {
  const stagesCompleted = report.stages.reduce((sum, s) => sum + s.n, 0);
  const stagesPending = report.stages.reduce((sum, s) => sum + s.pending, 0);
  const stagesShown = report.stages.filter((s) => !s.hidden).length;
  return (
    <EmptyState
      icon={<Timer />}
      title={filtered ? "Rien ne se calcule avec ces filtres" : "Pas encore assez de données pour mesurer des délais"}
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
              Brancher la collecte
            </Link>
          </>
        )
      }
    >
      {filtered
        ? `Aucun indicateur n'atteint ${MIN_OBSERVATIONS} observations sur cette sélection — élargis la période ou retire un filtre.`
        : `Un délai s'affiche à partir de ${MIN_OBSERVATIONS} observations ; en dessous, un chiffre mentirait. Chaque geste dans le produit en crée : voici où en est chaque indicateur.`}
      <span className="mt-3 block text-left">
        <span className="flex flex-col gap-1.5 text-xs">
          {report.cycle.map(({ metric, stat }) => (
            <span key={metric.id} className="flex flex-col gap-0.5">
              <span className="text-foreground">
                {metric.label} —{" "}
                {stat.unavailable ? (
                  <span className="text-muted-foreground">{stat.unavailable}</span>
                ) : (
                  <>
                    <span className="tabular-nums">{stat.n}/{MIN_OBSERVATIONS}</span>
                    {stat.pending > 0 && `, ${plural(stat.pending, "en cours")}`}
                    {stat.excludedUnknown > 0 && `, ${plural(stat.excludedUnknown, "écartée")}`}
                  </>
                )}
              </span>
              {!filtered && <span>{metric.howToFeed}</span>}
            </span>
          ))}
          <span className="flex flex-col gap-0.5">
            <span className="text-foreground">
              {METRICS.stage_duration.label} —{" "}
              <span className="tabular-nums">
                {plural(stagesCompleted, "passage terminé", "passages terminés")}
              </span>
              {stagesPending > 0 && `, ${plural(stagesPending, "en cours")}`}
              {stagesShown > 0 && ` (${plural(stagesShown, "étape affichable", "étapes affichables")})`}
            </span>
            {!filtered && <span>{METRICS.stage_duration.howToFeed}</span>}
          </span>
        </span>
      </span>
    </EmptyState>
  );
}

function PipelineSections({ pipeline, report, single }: { pipeline: PipelineWithStages; report: DelaysReport; single: boolean }) {
  const stages = report.stages.filter((s) => s.pipelineId === pipeline.id);
  const pairs = report.pairs.filter((p) => p.pipelineId === pipeline.id);
  if (stages.length === 0 && pairs.length === 0) return null;
  const prefix = single ? "" : `${pipeline.label} — `;
  const stageRows: DurationRow[] = stages.map((s) => ({
    key: s.stageId,
    label: <StageLabel stage={s} />,
    note: statNotes(s, STAGE_WORDS),
    stat: s,
  }));
  const pairRows: DurationRow[] = pairs.map((p) => ({
    key: `${p.fromStageId}-${p.toStageId}`,
    label: `${p.fromLabel} → ${p.toLabel}`,
    note: statNotes(p),
    stat: p,
  }));
  return (
    <>
      {stageRows.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">
            {prefix}
            <DefinitionLink id="stage_duration">{single ? "Temps passé par étape" : "temps passé par étape"}</DefinitionLink>
          </h2>
          <p className="-mt-1 text-xs text-muted-foreground">
            Sur les passages terminés ; une affaire qui revisite une étape compte un passage par visite. Les étapes finales ne sont pas
            listées : on n&apos;en sort pas. Le libellé ouvre les affaires qui y sont aujourd&apos;hui.
          </p>
          <DurationTable rows={stageRows} labelHeader="Étape" />
        </section>
      )}
      {pairRows.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">
            {prefix}
            <DefinitionLink id="stage_pair_delay">{single ? "D'une étape à la suivante" : "d'une étape à la suivante"}</DefinitionLink>
          </h2>
          <p className="-mt-1 text-xs text-muted-foreground">
            De la première entrée dans une étape à la première entrée dans la suivante, sur les affaires qui ont atteint les deux.
          </p>
          <DurationTable rows={pairRows} labelHeader="Étapes" />
        </section>
      )}
    </>
  );
}

export default async function DelaysPage({ searchParams }: { searchParams: Promise<MetricSearchParams> }) {
  const user = await requireUser();
  const raw = await searchParams;

  const header = (
    <PageHeader
      title="Délais et durées"
      description="Combien de temps prend chaque étape du cycle — médiane et moyenne côte à côte, toujours avec le nombre d'observations. Un indicateur calculé sur trop peu de cas est masqué, jamais affiché."
    />
  );

  if (!user.organizationId) {
    return (
      <>
        {header}
        <EmptyState title="Tu es en vue globale">
          Choisis une organisation dans le bandeau super admin en haut de l&apos;écran pour voir ses délais — un agrégat ne
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
    delaysReport(user, parsed.filters),
  ]);

  const shows = reportShowsAnything(report);
  const cycleRows: DurationRow[] = report.cycle.map(({ metric, stat }) => ({
    key: metric.id,
    label: <DefinitionLink id={metric.id as keyof typeof METRICS}>{metric.label}</DefinitionLink>,
    note: statNotes(stat, CYCLE_WORDS[metric.id as keyof typeof CYCLE_WORDS]),
    stat,
  }));
  const shownPipelines = parsed.filters.pipelineId ? pipelines.filter((p) => p.id === parsed.filters.pipelineId) : pipelines;

  return (
    <>
      {header}
      <AnalyticsFiltersBar basePath={BASE_PATH} parsed={parsed} users={users} types={types} pipelines={pipelines} origins={origins} exportView="delais" />

      {!shows ? (
        <NotEnoughData report={report} filtered={parsed.active} />
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">Le cycle</h2>
            <p className="-mt-1 text-xs text-muted-foreground">
              Dans l&apos;ordre de la vie d&apos;une affaire : du lead au premier contact, de la création à la signature, du partage à la
              réponse du partenaire, de la commission confirmée à son règlement.
            </p>
            <DurationTable rows={cycleRows} />
          </section>

          {shownPipelines.map((p) => (
            <PipelineSections key={p.id} pipeline={p} report={report} single={shownPipelines.length === 1} />
          ))}
        </>
      )}

      <MetricDefinitions metrics={metricsOfFamily("delays")} />

      <p className="text-xs text-muted-foreground">
        Les délais se calculent à la volée sur le journal d&apos;événements de ton organisation ; la période porte sur l&apos;événement
        qui clôt chaque délai (fin de passage, signature, réponse, règlement, première interaction). Les origines se rapprochent dans{" "}
        <Link href="/analytique/origines" className="underline underline-offset-2 hover:text-foreground">
          Analytique → Origines
        </Link>
        .
      </p>
    </>
  );
}
