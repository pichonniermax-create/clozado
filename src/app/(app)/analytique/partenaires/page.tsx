import { use } from "react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Handshake } from "lucide-react";
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
import { getFormats } from "@/i18n/formats";
import {
  METRICS,
  MIN_OBSERVATIONS,
  metricsOfFamily,
  parseMetricFilters,
  partnersHasAnyData,
  partnersReport,
  type DurationStat,
  type MetricSearchParams,
  type MoneyCount,
  type PartnersReport,
} from "@/lib/metrics";
import { requireUser } from "@/lib/session";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { TranslatorOf } from "@/i18n/translator";
import type { Formats } from "@/lib/format";

const BASE_PATH = "/analytique/partenaires";


function DefinitionLink({ id, children }: { id: keyof typeof METRICS; children: ReactNode }) {
  return (
    <a href={`#${definitionAnchor(METRICS[id])}`} className="underline-offset-2 hover:underline">
      {children}
    </a>
  );
}

const MASKED = <span className="text-muted-foreground">—</span>;

/** Médiane et moyenne côte à côte, ou le tiret avec ce qui manque — la même règle que le tableau des délais, en une cellule. */
function DelayCell({ stat }: { stat: DurationStat }) {
  const t = useTranslations("analytics.partenaires");
  const fmt = use(getFormats());
  if (stat.hidden || stat.medianDays === null || stat.meanDays === null) {
    return (
      <span className="text-muted-foreground" title={stat.n === 0 ? t("aucune_reponse") : t("masque_il_manque_reponse_reponses", { missing: stat.missing })}>
        —{stat.n > 0 && <span className="block text-xs">{stat.n}/{MIN_OBSERVATIONS}</span>}
      </span>
    );
  }
  return (
    <>
      {t.rich("med_moy_n", { formatDuration: fmt.duration(stat.medianDays), formatDuration2: fmt.duration(stat.meanDays), n: stat.n, span: (chunks) => <span className="block whitespace-nowrap">{chunks}</span>, span2: (chunks) => <span className="block whitespace-nowrap text-xs text-muted-foreground">{chunks}</span> })}
    </>
  );
}

/**
 * Un montant et, dessous, ce qui n'a pas pu y entrer ; le nombre de
 * commissions seulement quand aucune colonne ne le porte déjà. « — » quand
 * aucune commission ne porte de montant : jamais 0 € pour dire « inconnu ».
 */
function MoneyCell({ money, showCount = true }: { money: MoneyCount; showCount?: boolean }) {
  const t = useTranslations("analytics.partenaires");
  const fmt = use(getFormats());
  const parts = [showCount && money.n > 0 ? t("commission_commissions", { n: money.n }) : null, money.withoutAmount > 0 ? `${money.withoutAmount} sans montant` : null].filter(Boolean);
  return (
    <>
      {money.n === 0 || money.withoutAmount === money.n ? MASKED : fmt.money(money.amount)}
      {parts.length > 0 && <span className="block text-xs text-muted-foreground">{parts.join(", ")}</span>}
    </>
  );
}

/** « pour 600 € », « pour 600 € (1 sans montant) », ou « au montant inconnu » quand aucune ne porte de montant — la même règle que les cellules. */
function forAmount(money: MoneyCount, t: TranslatorOf<"analytics.partenaires">, fmt: Formats): ReactNode {
  if (money.withoutAmount === money.n) return t("au_montant_inconnu");
  return (
    <>
      {t.rich("pour", { formatEuros: (fmt.money(money.amount)) ?? "", span: (chunks) => <span className="tabular-nums">{chunks}</span> })}
      {money.withoutAmount > 0 && <span className="text-muted-foreground"> {t("sans_montant", { withoutAmount: money.withoutAmount })}</span>}
    </>
  );
}

const th = (label: ReactNode, align: "left" | "right" = "right") => (
  <th scope="col" className={`px-3 py-2.5 font-medium ${align === "right" ? "text-right" : "text-left"}`}>
    {label}
  </th>
);
const td = (content: ReactNode) => <td className="px-3 py-3 text-right align-top tabular-nums">{content}</td>;

function NotEnoughData({ report, filtered }: { report: PartnersReport; filtered: boolean }) {
  const t = useTranslations("analytics.partenaires");
  const tm = useTranslations("metrics");
  return (
    <EmptyState
      icon={<Handshake />}
      title={filtered ? t("aucun_partage_sur_cette_selection") : t("aucun_partage_pour_l_instant")}
      action={
        filtered ? (
          <Link href={BASE_PATH} className={buttonVariants({ variant: "outline" })}>
            {t("retirer_les_filtres")}
          </Link>
        ) : (
          <>
            {t.rich("voir_les_partenaires_ouvrir_le_pipeline", { link: (chunks) => <Link href="/partenaires" className={buttonVariants({ variant: "outline" })}>{chunks}</Link>, link2: (chunks) => <Link href="/affaires" className={buttonVariants({ variant: "ghost" })}>{chunks}</Link> })}
          </>
        )
      }
    >
      {filtered
        ? t("aucun_partage_envoye_a_cette_date_c42d")
        : t("tout_part_d_un_partage_depuis_6a68")}
      <span className="mt-3 block text-left">
        <span className="flex flex-col gap-1.5 text-xs">
          <span className="text-foreground">
            {t.rich("partenaire_partenaires", { label: tm("definitions.partner_shares.label"), sent: report.totals.sent, count: report.partners.length, span: (chunks) => <span className="tabular-nums">{chunks}</span> })}
          </span>
          {!filtered && <span>{tm("definitions.partner_shares.howToFeed")}</span>}
          <span className="text-foreground">
            {t.rich("commissions_tous_etats", { reduce: report.commissions.states.reduce((s, x) => s + x.n, 0), span: (chunks) => <span className="tabular-nums">{chunks}</span> })}
          </span>
          {!filtered && <span>{tm("definitions.commissions_outstanding.howToFeed")}</span>}
        </span>
      </span>
    </EmptyState>
  );
}

export default async function PartnersAnalyticsPage({ searchParams }: { searchParams: Promise<MetricSearchParams> }) {
  const t = await getTranslations("analytics.partenaires");
  const tm = await getTranslations("metrics");
  const fmt = await getFormats();
  const user = await requireUser();
  const raw = await searchParams;

  const header = (
    <PageHeader
      title={t("partenaires_et_commissions")}
      description={t("ce_que_chaque_confrere_fait_de_c359")}
    />
  );

  if (!user.organizationId) {
    return (
      <>
        {header}
        <EmptyState title={t("tu_es_en_vue_globale")}>
          {t("choisis_une_organisation_dans_le_bandeau_0b8a")}
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
    partnersReport(user, parsed.filters, tm),
  ]);
  const hasData = partnersHasAnyData(report);
  const { totals, commissions } = report;

  return (
    <>
      {header}
      <AnalyticsFiltersBar basePath={BASE_PATH} parsed={parsed} users={users} types={types} pipelines={pipelines} origins={origins} exportView="partenaires" />

      {!hasData ? (
        <NotEnoughData report={report} filtered={parsed.active} />
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">
              <DefinitionLink id="partner_shares">{t("par_partenaire")}</DefinitionLink>
            </h2>
            <p className="-mt-1 text-xs text-muted-foreground text-pretty">
              {t("les_partages_envoyes_suivis_jusqu_a_4cbd", { periodPhrase: periodPhrase(parsed, tm, fmt) })}
            </p>
            {report.partners.length === 0 ? (
              <EmptyState
                title={t("aucun_partenaire")}
                action={
                  <Link href="/partenaires?nouveau=1" className={buttonVariants({ variant: "outline" })}>
                    {t("ajouter_un_partenaire")}
                  </Link>
                }
              >
                {t("les_partages_se_mesurent_par_confrere_eb43")}
              </EmptyState>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full min-w-[72rem] text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      {th(t("partenaire"), "left")}
                      {th(t("partages"))}
                      {th(t("acceptes"))}
                      {th(t("refuses"))}
                      {th(t("sans_reponse"))}
                      {th(<DefinitionLink id="partner_acceptance_rate">{t("acceptation")}</DefinitionLink>)}
                      {th(<DefinitionLink id="partner_response_delay">{t("delai_de_reponse")}</DefinitionLink>)}
                      {th(t("gagnees"))}
                      {th(<DefinitionLink id="partner_transformation_rate">{t("transformation")}</DefinitionLink>)}
                      {th(<DefinitionLink id="partner_commissions">{t("commissions_acquises")}</DefinitionLink>)}
                      {th(t("commissions_prevues"))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {report.partners.map((p) => (
                      <tr key={p.partnerId}>
                        <th scope="row" className="px-3 py-3 text-left align-top font-medium">
                          <Link href={`/partenaires/${p.partnerId}`} className="underline-offset-2 hover:underline">
                            {p.name}
                          </Link>
                          {(p.company || p.profession || !p.active) && (
                            <span className="block text-xs font-normal text-muted-foreground">
                              {[p.profession, p.company, p.active ? null : "inactif"].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </th>
                        {td(p.sent)}
                        {td(p.accepted)}
                        {td(p.declined)}
                        {td(
                          <>
                            {p.pending + p.expired + p.revoked}
                            {p.pending + p.expired + p.revoked > 0 && (
                              <span className="block text-xs text-muted-foreground">
                                {[p.pending > 0 && `${p.pending} en attente`, p.expired > 0 && `${p.expired} expiré${p.expired > 1 ? "s" : ""}`, p.revoked > 0 && `${p.revoked} révoqué${p.revoked > 1 ? "s" : ""}`]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            )}
                          </>
                        )}
                        {td(rateText(p.acceptanceRate, fmt, true))}
                        {td(<DelayCell stat={p.responseDelay} />)}
                        {td(p.won)}
                        {td(rateText(p.transformationRate, fmt, true))}
                        {td(<MoneyCell money={p.earned} />)}
                        {td(<MoneyCell money={p.planned} />)}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-muted/40 font-medium">
                      <th scope="row" className="px-3 py-3 text-left align-top">
                        {t("ensemble")}
                      </th>
                      {td(totals.sent)}
                      {td(totals.accepted)}
                      {td(totals.declined)}
                      {td(totals.noResponse)}
                      {td(rateText(totals.acceptanceRate, fmt, true))}
                      {td(MASKED)}
                      {td(totals.won)}
                      {td(rateText(totals.transformationRate, fmt, true))}
                      {td(<MoneyCell money={totals.earned} />)}
                      {td(<MoneyCell money={totals.planned} />)}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">
              <DefinitionLink id="commissions_outstanding">{t("encours_de_commissions_a_aujourd_hui")}</DefinitionLink>
            </h2>
            <p className="-mt-1 text-xs text-muted-foreground text-pretty">
              {t.rich("un_etat_pas_une_periode_la_12b8", { link: (chunks) => <Link href="/suivi" className="underline underline-offset-2 hover:text-foreground">{chunks}</Link> })}
            </p>
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[32rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    {th(t("etat"), "left")}
                    {th(t("commissions"))}
                    {th(t("montant"))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {commissions.states.map((s) => (
                    <tr key={s.key}>
                      <th scope="row" className="px-3 py-3 text-left align-top font-medium">
                        {s.label}
                      </th>
                      {td(s.n)}
                      {td(<MoneyCell money={s} showCount={false} />)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">
              <DefinitionLink id="commissions_aging">{t("vieillissement_des_commissions_confirmees_non_reglees")}</DefinitionLink>
            </h2>
            <p className="-mt-1 text-xs text-muted-foreground text-pretty">
              {t.rich("depuis_la_date_de_confirmation_observee_703b", { n: commissions.overdue.n, formatDays: fmt.days(commissions.overdue.thresholdDays), span: (chunks) => <span className="tabular-nums">{chunks}</span> })}
              {commissions.overdue.n > 0 && <>, {forAmount(commissions.overdue, t, fmt)}</>}
              .
              {commissions.unknownConfirmedAt.n > 0 && (
                <>
                  {t.rich("confirmee_confirmees_a_la_date_inconnue", { n: commissions.unknownConfirmedAt.n, span: (chunks) => <span className="tabular-nums">{chunks}</span> })}
                  {forAmount(commissions.unknownConfirmedAt, t, fmt)} {t("ecartee_ecartees_du_vieillissement_jamais_datee_ca24", { n: commissions.unknownConfirmedAt.n })}
                </>
              )}
            </p>
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[32rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    {th(t("anciennete"), "left")}
                    {th(t("commissions"))}
                    {th(t("montant"))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {commissions.aging.map((b) => (
                    <tr key={b.key}>
                      <th scope="row" className="px-3 py-3 text-left align-top font-medium">
                        {b.label}
                      </th>
                      {td(b.n)}
                      {td(<MoneyCell money={b} showCount={false} />)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <MetricDefinitions metrics={metricsOfFamily("partners")} />

      <p className="text-xs text-muted-foreground text-pretty">
        {t.rich("un_taux_calcule_sur_moins_de_e7e1", { minObservations: MIN_OBSERVATIONS, link: (chunks) => <Link href="/analytique/delais" className="underline underline-offset-2 hover:text-foreground">{chunks}</Link>, link2: (chunks) => <Link href="/settings" className="underline underline-offset-2 hover:text-foreground">{chunks}</Link> })}
      </p>
    </>
  );
}
