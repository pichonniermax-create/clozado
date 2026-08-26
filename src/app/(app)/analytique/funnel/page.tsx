import { use } from "react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Funnel } from "lucide-react";
import { dealsListHref } from "@/components/analytics/deals-list-href";
import { AnalyticsFiltersBar } from "@/components/analytics/filters-bar";
import { CountCell, FunnelSteps, rateText, type FunnelRow } from "@/components/analytics/funnel-steps";
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
  type PipelineFunnel, MIN_OBSERVATIONS } from "@/lib/metrics";
import { requireUser } from "@/lib/session";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { TranslatorOf } from "@/i18n/translator";
import { getFormats } from "@/i18n/formats";

const BASE_PATH = "/analytique/funnel";


const listHref = dealsListHref;

function DefinitionLink({ id, children }: { id: keyof typeof METRICS; children: ReactNode }) {
  return (
    <a href={`#${definitionAnchor(METRICS[id])}`} className="underline-offset-2 hover:underline">
      {children}
    </a>
  );
}

function ListLink({ href, children, title }: { href: string; children: ReactNode; title?: string }) {
  const t = useTranslations("analytics.funnel");
  return (
    <Link href={href} className="underline-offset-2 hover:underline" title={title ?? t("voir_la_liste_de_ces_affaires")}>
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
  const t = useTranslations("analytics.funnel");
  const tm = useTranslations("metrics");
  return (
    <EmptyState
      icon={<Funnel />}
      title={filtered ? t("rien_ne_se_compte_avec_ces_f02e") : t("pas_encore_de_quoi_dessiner_le_fb6b")}
      action={
        filtered ? (
          <Link href={BASE_PATH} className={buttonVariants({ variant: "outline" })}>
            {t("retirer_les_filtres")}
          </Link>
        ) : (
          <>
            {t.rich("creer_une_affaire_brancher_la_collecte", { link: (chunks) => <Link href="/affaires?nouveau=1" className={buttonVariants({ variant: "outline" })}>{chunks}</Link>, link2: (chunks) => <Link href="/settings" className={buttonVariants({ variant: "ghost" })}>{chunks}</Link> })}
          </>
        )
      }
    >
      {filtered
        ? t("aucun_pas_ne_compte_quoi_que_eff0")
        : t("le_funnel_se_dessine_avec_les_080b")}
      <span className="mt-3 block text-left">
        <span className="flex flex-col gap-1.5 text-xs">
          {report.chain.steps.map(({ metric, count }) => (
            <span key={metric.id} className="flex flex-col gap-0.5">
              <span className="text-foreground">
                {tm(`definitions.${metric.id}.label`)} —{" "}
                {count.unavailable ? <span className="text-muted-foreground">{count.unavailable}</span> : <span className="tabular-nums">{count.n}</span>}
              </span>
              {!filtered && <span>{tm(`definitions.${metric.id}.howToFeed`)}</span>}
            </span>
          ))}
          {report.pipelines.map((p) => (
            <span key={p.pipelineId} className="text-foreground">
              {t.rich("affaire_creee_affaires_creees", { label: p.label, created: p.created, span: (chunks) => <span className="tabular-nums">{chunks}</span> })}
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
  scopedPipelineId: string | null,
  t: TranslatorOf<"analytics.funnel">
): ReactNode {
  const step = chain.steps.find((s) => s.metric.id === metricId)!;
  const over = step.rate && step.rate.percent !== null && step.rate.percent > 100;
  switch (metricId) {
    case "funnel_visitors":
      return !chain.collection.everEvents ? (
        <>
          {t.rich("les_visites_ne_sont_pas_encore_6b95", { settingslink: (chunks) => <SettingsLink>{chunks}</SettingsLink> })}
        </>
      ) : undefined;
    case "funnel_leads":
      if (!chain.collection.everLeads) {
        return (
          <>
            {t.rich("aucun_lead_recu_brancher_l_entree_0737", { settingslink: (chunks) => <SettingsLink>{chunks}</SettingsLink> })}
          </>
        );
      }
      return over ? t("plus_de_leads_que_de_simulations_688b") : undefined;
    case "funnel_contacted":
      return chain.leadsPending > 0
        ? t("lead_sans_premier_contact_consigne_leads_5f95", { n: chain.leadsPending })
        : undefined;
    case "funnel_deals_from_leads": {
      const parts: ReactNode[] = [];
      if (over) parts.push(t("plus_d_affaires_que_de_contacts_8baf"));
      if (!scopedPipelineId && chain.deals.byPipeline.length > 0) {
        parts.push(
          <>
            {t("par_pipeline")}
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
      const lost = t("perdue_perdues", { n: chain.deals.lost });
      const open = t("en_cours_en_cours", { n: chain.deals.open });
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
  const t = useTranslations("analytics.funnel");
  const tm = useTranslations("metrics");
  const fmt = use(getFormats());
  const { chain } = report;
  const rows: FunnelRow[] = chain.steps.map((step) => {
    const id = step.metric.id as keyof typeof METRICS;
    let label: ReactNode = <DefinitionLink id={id}>{tm(`definitions.${step.metric.id}.label`)}</DefinitionLink>;
    if (scopedPipelineId && !step.count.unavailable && id === "funnel_deals_from_leads") {
      label = <ListLink href={listHref(parsed, scopedPipelineId, { cohorte: "lead" })}>{tm(`definitions.${step.metric.id}.label`)}</ListLink>;
    }
    if (scopedPipelineId && !step.count.unavailable && id === "funnel_won") {
      label = <ListLink href={listHref(parsed, scopedPipelineId, { cohorte: "lead", issue: "gagnee" })}>{tm(`definitions.${step.metric.id}.label`)}</ListLink>;
    }
    return { key: id, label, count: step.count, rate: step.rate, note: chainNote(chain, id, parsed, scopedPipelineId, t) };
  });
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">{t("la_chaine_de_la_visite_a_fa8a")}</h2>
      <p className="-mt-1 text-xs text-muted-foreground text-pretty">
        {t("les_trois_premiers_pas_comptent_des_9da4", { periodPhrase: periodPhrase(parsed, tm, fmt) })}
      </p>
      <FunnelSteps rows={rows} />
    </section>
  );
}

function StageDot({ color }: { color: string | null }) {
  return <span aria-hidden className="mr-2 inline-block size-2.5 shrink-0 rounded-full align-middle" style={{ backgroundColor: color ?? "var(--muted-foreground)" }} />;
}

function PipelineSection({ funnel, parsed, single }: { funnel: PipelineFunnel; parsed: ParsedMetricFilters; single: boolean }) {
  const t = useTranslations("analytics.funnel");
  const tm = useTranslations("metrics");
  const fmt = use(getFormats());
  const href = (over: Partial<DealSelectionParams> = {}) => listHref(parsed, funnel.pipelineId, over);
  const prefix = single ? "" : `${funnel.label} — `;
  const rows: FunnelRow[] = funnel.stages.map((s) => {
    const parts: ReactNode[] = [];
    if (s.lostHere > 0) {
      parts.push(
        <ListLink key="lost" href={href({ jusqua: s.stageId, issue: "perdue" })}>
          {t("perdue_perdues_depuis_cette_etape", { lostHere: s.lostHere })}
        </ListLink>
      );
    }
    if (s.openHere > 0) {
      parts.push(
        <ListLink key="open" href={href({ jusqua: s.stageId, issue: "en-cours" })}>
          {t("en_cours_en_cours_au_plus_8c73", { openHere: s.openHere })}
        </ListLink>
      );
    }
    return {
      key: s.stageId,
      label: (
        <ListLink href={href({ atteint: s.stageId })} title={t("voir_les_affaires_qui_ont_atteint_f2c3")}>
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
    label: <ListLink href={href({ issue: "gagnee" })}>{t("gagnees")}</ListLink>,
    count: { n: funnel.won },
    rate: funnel.wonRate,
    note: (
      <>
        <ListLink href={href({ issue: "perdue" })}>{t("perdue_perdues_au_total", { lost: funnel.lost })}</ListLink>
        {" · "}
        <ListLink href={href({ issue: "en-cours" })}>{t("en_cours_en_cours", { n: funnel.open })}</ListLink>
      </>
    ),
  });

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">
        {prefix}
        <DefinitionLink id="funnel_stage_reached">{single ? t("par_etape_du_pipeline") : t("par_etape")}</DefinitionLink>
      </h2>
      <p className="-mt-1 text-xs text-muted-foreground text-pretty">
        <ListLink href={href()}>
          {t.rich("affaire_creee_affaires_creees_c2f7", { created: funnel.created, periodPhrase: periodPhrase(parsed, tm, fmt), span: (chunks) => <span className="tabular-nums">{chunks}</span> })}
        </ListLink>
        {funnel.created > 0 && (
          <>
            {t.rich("dont_issue_issues_d_un_lead", { createdFromLead: funnel.createdFromLead, span: (chunks) => <span className="tabular-nums">{chunks}</span> })}
          </>
        )}
        {t("chaque_etape_compte_les_affaires_allees_4547")}
      </p>
      {funnel.created === 0 ? (
        <EmptyState>{t("aucune_affaire_creee_dans_ce_pipeline_53a0", { periodPhrase: periodPhrase(parsed, tm, fmt) })}</EmptyState>
      ) : (
        <FunnelSteps rows={rows} labelHeader={t("etape")} />
      )}
    </section>
  );
}

function OriginsSection({ rows, parsed }: { rows: OriginFunnelRow[]; parsed: ParsedMetricFilters }) {
  const t = useTranslations("analytics.funnel");
  const fmt = use(getFormats());
  const header = (label: string, align: "left" | "right" = "right") => (
    <th scope="col" className={`px-3 py-2.5 font-medium ${align === "right" ? "text-right" : "text-left"}`}>
      {label}
    </th>
  );
  const cell = (content: ReactNode) => <td className="px-3 py-3 text-right align-top tabular-nums">{content}</td>;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">
        <DefinitionLink id="funnel_by_origin">{t("par_origine_laquelle_genere_des_affaires_6ba2")}</DefinitionLink>
      </h2>
      <p className="-mt-1 text-xs text-muted-foreground text-pretty">
        {t("les_memes_pas_que_la_chaine_ef4b", { n: (parsed.filters.ownerId && t("visites_et_simulations_sans_objet_par_d74a")) ?? "" })}
      </p>
      {rows.length === 0 ? (
        <EmptyState
          title={t("aucune_origine_pour_l_instant")}
          action={
            <Link href="/analytique/origines" className={buttonVariants({ variant: "outline" })}>
              {t("configurer_les_origines")}
            </Link>
          }
        >
          {t("une_origine_un_simulateur_une_page_2643")}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[64rem] text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                {header(t("origine"), "left")}
                {header(t("visiteurs"))}
                {header(t("sim_demarrees"))}
                {header(t("sim_terminees"))}
                {header(t("leads"))}
                {header(t("contacts_etablis"))}
                {header(t("affaires"))}
                {header(t("gagnees"))}
                {header("Lead → affaire")}
                {header(t("affaire_gagnee"))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row" className="px-3 py-3 text-left font-medium align-top">
                    <Link
                      href={`${BASE_PATH}${metricQueryString(parsed.params, { origine: row.key })}`}
                      className="underline-offset-2 hover:underline"
                      title={t("filtrer_l_ecran_sur_cette_origine")}
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
                  {cell(rateText(row.leadToDeal, fmt, true))}
                  {cell(rateText(row.dealToWon, fmt, true))}
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
  const t = await getTranslations("analytics.funnel");
  const tm = await getTranslations("metrics");
  const fmt = await getFormats();
  const user = await requireUser();
  const raw = await searchParams;

  const header = (
    <PageHeader
      title={t("funnel_de_conversion")}
      description={t("une_seule_chaine_de_la_visite_9a3c")}
    />
  );

  if (!user.organizationId) {
    return (
      <>
        {header}
        <EmptyState title={t("tu_es_en_vue_globale")}>
          {t("choisis_une_organisation_dans_le_bandeau_2b5e")}
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
    funnelReport(user, parsed.filters, tm),
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
        {t.rich("le_funnel_se_calcule_a_la_0306", { rateThresholdNote: t("rate_threshold_note", { minObservations: MIN_OBSERVATIONS }), link: (chunks) => <Link href="/analytique/delais" className="underline underline-offset-2 hover:text-foreground">{chunks}</Link>, link2: (chunks) => <Link href="/analytique/origines" className="underline underline-offset-2 hover:text-foreground">{chunks}</Link> })}
      </p>
    </>
  );
}
