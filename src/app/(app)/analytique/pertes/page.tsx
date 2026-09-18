import Link from "next/link";
import { Banknote, Percent, TrendingDown, Trophy } from "lucide-react";
import { BreakdownTable, type BreakdownRow } from "@/components/analytics/breakdown-table";
import { dealsListHref } from "@/components/analytics/deals-list-href";
import { DATA_LINK_CLASS, DefinitionLink } from "@/components/analytics/definition-link";
import { AnalyticsFiltersBar } from "@/components/analytics/filters-bar";
import { MetricDefinitions } from "@/components/analytics/metric-definitions";
import { periodPhrase } from "@/lib/metrics/period-phrase";
import { PageHeader } from "@/components/app-shell/page-header";
import { StatTile } from "@/components/stat-tile";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { listOrigins } from "@/db/queries/acquisition";
import { listOrgUsers } from "@/db/queries/contacts";
import { listDealTypes } from "@/db/queries/deal-types";
import { listPipelinesWithStages } from "@/db/queries/pipelines";
import { getFormats } from "@/i18n/formats";
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
import { getPreferences } from "@/db/queries/preferences";
import { withRememberedPeriod } from "@/lib/display/period";
import { requireUser } from "@/lib/session";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

const BASE_PATH = "/analytique/pertes";

/** L'état sans perte : une bonne nouvelle ou un pipeline pas tenu — l'inventaire le dit, avec les gestes. */
function NotEnoughData({ report, filtered }: { report: LossesReport; filtered: boolean }) {
  const t = useTranslations("analytics.pertes");
  const tm = useTranslations("metrics");
  return (
    <EmptyState
      icon={<TrendingDown />}
      title={filtered ? t("aucune_perte_sur_cette_selection") : t("aucune_affaire_perdue_pour_l_instant")}
      action={
        filtered ? (
          <Link href={BASE_PATH} className={buttonVariants({ variant: "outline" })}>
            {t("retirer_les_filtres")}
          </Link>
        ) : (
          <>
            {t.rich("ouvrir_le_pipeline_configurer_les_motifs", { link: (chunks) => <Link href="/affaires" className={buttonVariants({ variant: "outline" })}>{chunks}</Link>, link2: (chunks) => <Link href="/settings" className={buttonVariants({ variant: "ghost" })}>{chunks}</Link> })}
          </>
        )
      }
    >
      {filtered
        ? t("aucune_affaire_perdue_a_cette_date_185c")
        : t("une_perte_se_compte_quand_une_1fd0")}
      <span className="mt-3 block text-left">
        <span className="flex flex-col gap-1.5 text-xs">
          <span className="text-foreground">
            {tm("definitions.lost_deal.label")} — <span className="tabular-nums">{report.total.n}</span>
            {report.excludedReconstructed.n > 0 && t("pertes_anterieures_ecartees", { n: report.excludedReconstructed.n })}
          </span>
          {!filtered && <span>{tm("definitions.lost_deal.howToFeed")}</span>}
          <span className="text-foreground">
            {t.rich("gagnees_sur_la_periode", { won: report.won, span: (chunks) => <span className="tabular-nums">{chunks}</span> })}
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
  const t = useTranslations("analytics.pertes");
  const tableRows: BreakdownRow[] = rows.map((row) => {
    const over = scopedPipelineId ? link(row) : null;
    return {
      key: row.key,
      label: over ? (
        <Link href={dealsListHref(parsed, scopedPipelineId!, { cohorte: "perte", ...over })} className={DATA_LINK_CLASS} title={t("voir_ces_affaires")}>
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
        <EmptyState>{t("rien_a_repartir_sur_cette_selection")}</EmptyState>
      ) : (
        <BreakdownTable rows={tableRows} labelHeader={labelHeader} amountHeader={t("montant_perdu")} caption={title} />
      )}
    </section>
  );
}

export default async function LossesPage({ searchParams }: { searchParams: Promise<MetricSearchParams> }) {
  const t = await getTranslations("analytics.pertes");
  const tm = await getTranslations("metrics");
  const fmt = await getFormats();
  const user = await requireUser();
  const raw = await searchParams;

  const header = (
    <PageHeader
      title={t("analyse_des_pertes")}
      description={t("pourquoi_les_affaires_se_perdent_par_b36f")}
    />
  );

  if (!user.organizationId) {
    return (
      <>
        {header}
        <EmptyState title={t("tu_es_en_vue_globale")}>
          {t("choisis_une_organisation_dans_le_bandeau_593c")}
        </EmptyState>
      </>
    );
  }

  // La période de l'adresse, sinon celle dont la personne se souvient (lot 1, étape 2).
  const parsed = parseMetricFilters(withRememberedPeriod(raw, await getPreferences(user)), fmt.timeZone);
  const [pipelines, types, users, origins, report] = await Promise.all([
    listPipelinesWithStages(user),
    listDealTypes(user),
    listOrgUsers(user),
    listOrigins(user),
    lossesReport(user, parsed.filters, tm),
  ]);
  const scopedPipelineId = parsed.filters.pipelineId ?? (pipelines.length === 1 ? pipelines[0].id : null);
  const hasData = lossesHasAnyData(report);
  const period = periodPhrase(parsed, tm, fmt);
  const lossRate = report.lossRate.hidden || report.lossRate.percent === null ? null : fmt.rate(report.lossRate.percent);
  const noAmount = report.total.withoutAmount === report.total.n;

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
              <DefinitionLink id="lost_deal">{t("sur_la_periode")}</DefinitionLink>
            </h2>
            <p className="-mt-1 text-xs text-muted-foreground">{period}</p>
            {/* Quatre chiffres, quatre tuiles (audit UI du 2026-09-14) : la phrase qui les enchaînait cassait sa ponctuation (« perdu· 6 gagnées ») et noyait le taux de perte. */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile
                icon={<TrendingDown />}
                label={t("affaires_perdues")}
                value={report.total.n}
                tone="critical"
                href={scopedPipelineId ? dealsListHref(parsed, scopedPipelineId, { cohorte: "perte" }) : undefined}
              />
              <StatTile
                icon={<Banknote />}
                label={t("montant_estime_perdu")}
                value={noAmount ? "—" : (fmt.money(report.total.amount) ?? "—")}
                hint={noAmount ? t("montant_inconnu_n_sans_montant", { n: report.total.n }) : report.total.withoutAmount > 0 ? t("sans_montant", { withoutAmount: report.total.withoutAmount }) : undefined}
              />
              <StatTile icon={<Trophy />} label={t("gagnees_sur_la_meme_periode")} value={report.won} tone="success" />
              <StatTile
                icon={<Percent />}
                label={t("taux_de_perte_titre")}
                value={lossRate ?? "—"}
                hint={lossRate ? undefined : t("masque_il_manque_affaire_affaires_close_3720", { missing: report.lossRate.missing })}
              />
            </div>
            {report.excludedReconstructed.n > 0 && (
              <p className="-mt-1 text-xs text-muted-foreground text-pretty">
                {t("perte_anterieure_au_journal_ecartee_pertes_17e3", { n: report.excludedReconstructed.n })}
                {report.excludedReconstructed.withoutAmount === report.excludedReconstructed.n ? (
                  t("montant_inconnu")
                ) : (
                  <>
                    <span className="tabular-nums">{fmt.money(report.excludedReconstructed.amount)}</span>
                    {report.excludedReconstructed.withoutAmount > 0 && t("sans_montant", { withoutAmount: report.excludedReconstructed.withoutAmount })}
                  </>
                )}{" "}
                {t("jamais_datees_par_une_valeur_plausible")}
              </p>
            )}
            {!scopedPipelineId && (
              <p className="-mt-1 text-xs text-muted-foreground">{t("filtre_sur_un_pipeline_pour_ouvrir_614b")}</p>
            )}
          </section>

          {/* Deux répartitions par ligne dès lg (audit UI du 2026-09-14) : quatre tableaux d'une à trois lignes empilés sur 960 px laissaient 60 % de blanc. */}
          <div className="grid gap-6 lg:grid-cols-2">
          <BreakdownSection
            id="loss_breakdown"
            title={t("par_motif")}
            subtitle={t("le_motif_au_moment_de_la_a901")}
            labelHeader={t("motif")}
            rows={report.byReason}
            parsed={parsed}
            scopedPipelineId={scopedPipelineId}
            link={(row) => ({ motif: row.key })}
          />
          <BreakdownSection
            id="loss_breakdown"
            title={t("par_etape_de_depart")}
            subtitle={t("l_etape_d_ou_l_affaire_baa2")}
            labelHeader={t("etape")}
            rows={report.byStage}
            parsed={parsed}
            scopedPipelineId={scopedPipelineId}
            link={(row) => ({ depuis: row.key })}
          />
          <BreakdownSection
            id="loss_breakdown"
            title={t("par_conseiller")}
            subtitle={t("le_responsable_de_l_affaire_aujourd_701f")}
            labelHeader={t("conseiller")}
            rows={report.byOwner}
            parsed={parsed}
            scopedPipelineId={scopedPipelineId}
            link={(row) => (row.key === LOSS_NO_OWNER ? null : { conseiller: row.key })}
          />
          <BreakdownSection
            id="loss_breakdown"
            title={t("par_type_d_affaire")}
            subtitle={t("le_type_de_l_affaire_aujourd_f9d6")}
            labelHeader={t("type")}
            rows={report.byType}
            parsed={parsed}
            scopedPipelineId={scopedPipelineId}
            link={(row) => ({ type: row.key })}
          />
          </div>
        </>
      )}

      <MetricDefinitions metrics={metricsOfFamily("losses")} />

      <p className="text-xs text-muted-foreground text-pretty">
        {t.rich("une_part_calculee_sur_moins_de_19ce", { minObservations: MIN_OBSERVATIONS, link: (chunks) => <Link href="/settings" className="underline underline-offset-2 hover:text-foreground">{chunks}</Link>, link2: (chunks) => <Link href="/analytique/funnel" className="underline underline-offset-2 hover:text-foreground">{chunks}</Link> })}
      </p>
    </>
  );
}
