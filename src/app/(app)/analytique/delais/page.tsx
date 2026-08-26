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
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { TranslatorOf } from "@/i18n/translator";
import type { StatNoteWords } from "@/components/analytics/duration-table";
import { getFormats } from "@/i18n/formats";

const BASE_PATH = "/analytique/delais";

/** Les mots des mentions sous chaque indicateur (`analytics.delais.words.*`, accordés par la langue) — la règle d'assemblage vit dans `statNotes`. */
const cycleWords = (t: TranslatorOf<"analytics.delais">): Record<string, StatNoteWords> => ({
  lead_to_first_contact: { pending: (n) => t("words.lead_pending", { n }) },
  commission_settlement_delay: { unknown: (n) => t("words.commission_unknown", { n }) },
});
const stageWords = (t: TranslatorOf<"analytics.delais">): StatNoteWords => ({
  pending: (n) => t("words.stage_pending", { n }),
  reconstructed: (n) => t("words.stage_reconstructed", { n }),
});


function DefinitionLink({ id, children }: { id: keyof typeof METRICS; children: ReactNode }) {
  return (
    <a href={`#${definitionAnchor(METRICS[id])}`} className="underline-offset-2 hover:underline">
      {children}
    </a>
  );
}

function StageLabel({ stage }: { stage: { pipelineId: string; stageId: string; label: string; color: string | null } }) {
  const t = useTranslations("analytics.delais");
  return (
    <Link
      href={`/affaires?vue=liste&pipeline=${stage.pipelineId}&etape=${stage.stageId}`}
      className="inline-flex items-center gap-2 underline-offset-2 hover:underline"
      title={t("voir_les_affaires_actuellement_dans_cette_43a9")}
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
  const t = useTranslations("analytics.delais");
  const tm = useTranslations("metrics");
  const stagesCompleted = report.stages.reduce((sum, s) => sum + s.n, 0);
  const stagesPending = report.stages.reduce((sum, s) => sum + s.pending, 0);
  const stagesShown = report.stages.filter((s) => !s.hidden).length;
  return (
    <EmptyState
      icon={<Timer />}
      title={filtered ? t("rien_ne_se_calcule_avec_ces_70cf") : t("pas_encore_assez_de_donnees_pour_ffb2")}
      action={
        filtered ? (
          <Link href={BASE_PATH} className={buttonVariants({ variant: "outline" })}>
            {t("retirer_les_filtres")}
          </Link>
        ) : (
          <>
            {t.rich("ouvrir_le_pipeline_brancher_la_collecte", { link: (chunks) => <Link href="/affaires" className={buttonVariants({ variant: "outline" })}>{chunks}</Link>, link2: (chunks) => <Link href="/settings" className={buttonVariants({ variant: "ghost" })}>{chunks}</Link> })}
          </>
        )
      }
    >
      {filtered
        ? t("aucun_indicateur_n_atteint_observations_sur_a750", { minObservations: MIN_OBSERVATIONS })
        : t("un_delai_s_affiche_a_partir_bbc9", { minObservations: MIN_OBSERVATIONS })}
      <span className="mt-3 block text-left">
        <span className="flex flex-col gap-1.5 text-xs">
          {report.cycle.map(({ metric, stat }) => (
            <span key={metric.id} className="flex flex-col gap-0.5">
              <span className="text-foreground">
                {tm(`definitions.${metric.id}.label`)} —{" "}
                {stat.unavailable ? (
                  <span className="text-muted-foreground">{stat.unavailable}</span>
                ) : (
                  <>
                    <span className="tabular-nums">{stat.n}/{MIN_OBSERVATIONS}</span>
                    {stat.pending > 0 && t("cycle_pending", { n: stat.pending })}
                    {stat.excludedUnknown > 0 && t("cycle_excluded", { n: stat.excludedUnknown })}
                  </>
                )}
              </span>
              {!filtered && <span>{tm(`definitions.${metric.id}.howToFeed`)}</span>}
            </span>
          ))}
          <span className="flex flex-col gap-0.5">
            <span className="text-foreground">
              {t.rich("passage_termine_passages_termines", { label: tm("definitions.stage_duration.label"), stagesCompleted, n: (stagesPending > 0 && `, ${t("en_cours_en_courss", { n: stagesPending })}`) || "", n2: (stagesShown > 0 && ` (${t("etape_affichable_etapes_affichables", { n: stagesShown })})`) || "", span: (chunks) => <span className="tabular-nums">{chunks}</span> })}
            </span>
            {!filtered && <span>{tm("definitions.stage_duration.howToFeed")}</span>}
          </span>
        </span>
      </span>
    </EmptyState>
  );
}

function PipelineSections({ pipeline, report, single }: { pipeline: PipelineWithStages; report: DelaysReport; single: boolean }) {
  const t = useTranslations("analytics.delais");
  const td = useTranslations("analytics.durationTable");
  const stages = report.stages.filter((s) => s.pipelineId === pipeline.id);
  const pairs = report.pairs.filter((p) => p.pipelineId === pipeline.id);
  if (stages.length === 0 && pairs.length === 0) return null;
  const prefix = single ? "" : `${pipeline.label} — `;
  const stageRows: DurationRow[] = stages.map((s) => ({
    key: s.stageId,
    label: <StageLabel stage={s} />,
    note: statNotes(s, td, stageWords(t)),
    stat: s,
  }));
  const pairRows: DurationRow[] = pairs.map((p) => ({
    key: `${p.fromStageId}-${p.toStageId}`,
    label: `${p.fromLabel} → ${p.toLabel}`,
    note: statNotes(p, td),
    stat: p,
  }));
  return (
    <>
      {stageRows.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">
            {prefix}
            <DefinitionLink id="stage_duration">{single ? t("temps_passe_par_etape") : t("temps_passe_par_etape_19a1")}</DefinitionLink>
          </h2>
          <p className="-mt-1 text-xs text-muted-foreground">
            {t("sur_les_passages_termines_une_affaire_01c8")}
          </p>
          <DurationTable rows={stageRows} labelHeader={t("etape")} />
        </section>
      )}
      {pairRows.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">
            {prefix}
            <DefinitionLink id="stage_pair_delay">{single ? t("d_une_etape_a_la_suivante") : t("d_une_etape_a_la_suivante_2e3d")}</DefinitionLink>
          </h2>
          <p className="-mt-1 text-xs text-muted-foreground">
            {t("de_la_premiere_entree_dans_une_5e9d")}
          </p>
          <DurationTable rows={pairRows} labelHeader={t("etapes")} />
        </section>
      )}
    </>
  );
}

export default async function DelaysPage({ searchParams }: { searchParams: Promise<MetricSearchParams> }) {
  const t = await getTranslations("analytics.delais");
  const tm = await getTranslations("metrics");
  const td = await getTranslations("analytics.durationTable");
  const fmt = await getFormats();
  const user = await requireUser();
  const raw = await searchParams;

  const header = (
    <PageHeader
      title={t("delais_et_durees")}
      description={t("combien_de_temps_prend_chaque_etape_2312")}
    />
  );

  if (!user.organizationId) {
    return (
      <>
        {header}
        <EmptyState title={t("tu_es_en_vue_globale")}>
          {t("choisis_une_organisation_dans_le_bandeau_8953")}
        </EmptyState>
      </>
    );
  }

  const parsed = parseMetricFilters(raw, fmt.timeZone);
  const [pipelines, types, users, origins, report] = await Promise.all([
    listPipelinesWithStages(user),
    listDealTypes(user),
    listOrgUsers(user),
    listOrigins(user),
    delaysReport(user, parsed.filters, tm),
  ]);

  const shows = reportShowsAnything(report);
  const cycleRows: DurationRow[] = report.cycle.map(({ metric, stat }) => ({
    key: metric.id,
    label: <DefinitionLink id={metric.id as keyof typeof METRICS}>{tm(`definitions.${metric.id}.label`)}</DefinitionLink>,
    note: statNotes(stat, td, cycleWords(t)[metric.id] ?? {}),
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
            <h2 className="text-sm font-semibold">{t("le_cycle")}</h2>
            <p className="-mt-1 text-xs text-muted-foreground">
              {t("dans_l_ordre_de_la_vie_9ebc")}
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
        {t.rich("les_delais_se_calculent_a_la_1842", { link: (chunks) => <Link href="/analytique/origines" className="underline underline-offset-2 hover:text-foreground">{chunks}</Link> })}
      </p>
    </>
  );
}
