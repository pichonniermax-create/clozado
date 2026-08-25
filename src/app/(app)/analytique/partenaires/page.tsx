import Link from "next/link";
import type { ReactNode } from "react";
import { Handshake } from "lucide-react";
import { AnalyticsFiltersBar } from "@/components/analytics/filters-bar";
import { rateText } from "@/components/analytics/funnel-steps";
import { definitionAnchor, MetricDefinitions } from "@/components/analytics/metric-definitions";
import { periodPhrase } from "@/components/analytics/period-phrase";
import { PageHeader } from "@/components/app-shell/page-header";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { listOrigins } from "@/db/queries/acquisition";
import { listOrgUsers } from "@/db/queries/contacts";
import { listDealTypes } from "@/db/queries/deal-types";
import { listPipelinesWithStages } from "@/db/queries/pipelines";
import { formatDays, formatDuration, formatEuros } from "@/lib/format";
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

const BASE_PATH = "/analytique/partenaires";

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

const MASKED = <span className="text-muted-foreground">—</span>;

/** Médiane et moyenne côte à côte, ou le tiret avec ce qui manque — la même règle que le tableau des délais, en une cellule. */
function DelayCell({ stat }: { stat: DurationStat }) {
  if (stat.hidden || stat.medianDays === null || stat.meanDays === null) {
    return (
      <span className="text-muted-foreground" title={stat.n === 0 ? "aucune réponse" : `masqué : il manque ${stat.missing} réponse${stat.missing > 1 ? "s" : ""}`}>
        —{stat.n > 0 && <span className="block text-xs">{stat.n}/{MIN_OBSERVATIONS}</span>}
      </span>
    );
  }
  return (
    <>
      <span className="block whitespace-nowrap">méd. {formatDuration(stat.medianDays)}</span>
      <span className="block whitespace-nowrap text-xs text-muted-foreground">
        moy. {formatDuration(stat.meanDays)} · n = {stat.n}
      </span>
    </>
  );
}

/**
 * Un montant et, dessous, ce qui n'a pas pu y entrer ; le nombre de
 * commissions seulement quand aucune colonne ne le porte déjà. « — » quand
 * aucune commission ne porte de montant : jamais 0 € pour dire « inconnu ».
 */
function MoneyCell({ money, showCount = true }: { money: MoneyCount; showCount?: boolean }) {
  const parts = [showCount && money.n > 0 ? plural(money.n, "commission") : null, money.withoutAmount > 0 ? `${money.withoutAmount} sans montant` : null].filter(Boolean);
  return (
    <>
      {money.n === 0 || money.withoutAmount === money.n ? MASKED : formatEuros(money.amount)}
      {parts.length > 0 && <span className="block text-xs text-muted-foreground">{parts.join(", ")}</span>}
    </>
  );
}

/** « pour 600 € », « pour 600 € (1 sans montant) », ou « au montant inconnu » quand aucune ne porte de montant — la même règle que les cellules. */
function forAmount(money: MoneyCount): ReactNode {
  if (money.withoutAmount === money.n) return "au montant inconnu";
  return (
    <>
      pour <span className="tabular-nums">{formatEuros(money.amount)}</span>
      {money.withoutAmount > 0 && <span className="text-muted-foreground"> ({money.withoutAmount} sans montant)</span>}
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
  return (
    <EmptyState
      icon={<Handshake />}
      title={filtered ? "Aucun partage sur cette sélection" : "Aucun partage pour l'instant"}
      action={
        filtered ? (
          <Link href={BASE_PATH} className={buttonVariants({ variant: "outline" })}>
            Retirer les filtres
          </Link>
        ) : (
          <>
            <Link href="/partenaires" className={buttonVariants({ variant: "outline" })}>
              Voir les partenaires
            </Link>
            <Link href="/affaires" className={buttonVariants({ variant: "ghost" })}>
              Ouvrir le pipeline
            </Link>
          </>
        )
      }
    >
      {filtered
        ? "Aucun partage envoyé à cette date, pour ce conseiller, ce type, ce pipeline ou cette origine — élargis la période ou retire un filtre."
        : "Tout part d'un partage : depuis la fiche d'une affaire, un lien à ton nom envoyé à un confrère, avec la commission fixée à l'envoi. Sa réponse, son délai, l'issue de l'affaire et la commission se mesurent ensuite ici."}
      <span className="mt-3 block text-left">
        <span className="flex flex-col gap-1.5 text-xs">
          <span className="text-foreground">
            {METRICS.partner_shares.label} — <span className="tabular-nums">{report.totals.sent}</span> ({report.partners.length} partenaire
            {report.partners.length > 1 ? "s" : ""})
          </span>
          {!filtered && <span>{METRICS.partner_shares.howToFeed}</span>}
          <span className="text-foreground">
            Commissions, tous états — <span className="tabular-nums">{report.commissions.states.reduce((s, x) => s + x.n, 0)}</span>
          </span>
          {!filtered && <span>{METRICS.commissions_outstanding.howToFeed}</span>}
        </span>
      </span>
    </EmptyState>
  );
}

export default async function PartnersAnalyticsPage({ searchParams }: { searchParams: Promise<MetricSearchParams> }) {
  const user = await requireUser();
  const raw = await searchParams;

  const header = (
    <PageHeader
      title="Partenaires et commissions"
      description="Ce que chaque confrère fait de tes partages — acceptation, délai de réponse, transformation, commissions — et l'encours de commissions à aujourd'hui."
    />
  );

  if (!user.organizationId) {
    return (
      <>
        {header}
        <EmptyState title="Tu es en vue globale">
          Choisis une organisation dans le bandeau super admin en haut de l&apos;écran pour voir ses partenaires — un agrégat ne
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
    partnersReport(user, parsed.filters),
  ]);
  const hasData = partnersHasAnyData(report);
  const { totals, commissions } = report;

  return (
    <>
      {header}
      <AnalyticsFiltersBar basePath={BASE_PATH} parsed={parsed} users={users} types={types} pipelines={pipelines} origins={origins} />

      {!hasData ? (
        <NotEnoughData report={report} filtered={parsed.active} />
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">
              <DefinitionLink id="partner_shares">Par partenaire</DefinitionLink>
            </h2>
            <p className="-mt-1 text-xs text-muted-foreground text-pretty">
              Les partages envoyés {periodPhrase(parsed)}, suivis jusqu&apos;à aujourd&apos;hui — un lien renvoyé est le même partage. Le nom
              ouvre la fiche du partenaire. Un taux « — » est masqué faute d&apos;observations.
            </p>
            {report.partners.length === 0 ? (
              <EmptyState
                title="Aucun partenaire"
                action={
                  <Link href="/partenaires?nouveau=1" className={buttonVariants({ variant: "outline" })}>
                    Ajouter un partenaire
                  </Link>
                }
              >
                Les partages se mesurent par confrère : crée d&apos;abord sa fiche.
              </EmptyState>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full min-w-[72rem] text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      {th("Partenaire", "left")}
                      {th("Partages")}
                      {th("Acceptés")}
                      {th("Refusés")}
                      {th("Sans réponse")}
                      {th(<DefinitionLink id="partner_acceptance_rate">Acceptation</DefinitionLink>)}
                      {th(<DefinitionLink id="partner_response_delay">Délai de réponse</DefinitionLink>)}
                      {th("Gagnées")}
                      {th(<DefinitionLink id="partner_transformation_rate">Transformation</DefinitionLink>)}
                      {th(<DefinitionLink id="partner_commissions">Commissions acquises</DefinitionLink>)}
                      {th("Commissions prévues")}
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
                        {td(rateText(p.acceptanceRate, true))}
                        {td(<DelayCell stat={p.responseDelay} />)}
                        {td(p.won)}
                        {td(rateText(p.transformationRate, true))}
                        {td(<MoneyCell money={p.earned} />)}
                        {td(<MoneyCell money={p.planned} />)}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border bg-muted/40 font-medium">
                      <th scope="row" className="px-3 py-3 text-left align-top">
                        Ensemble
                      </th>
                      {td(totals.sent)}
                      {td(totals.accepted)}
                      {td(totals.declined)}
                      {td(totals.noResponse)}
                      {td(rateText(totals.acceptanceRate, true))}
                      {td(MASKED)}
                      {td(totals.won)}
                      {td(rateText(totals.transformationRate, true))}
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
              <DefinitionLink id="commissions_outstanding">Encours de commissions, à aujourd&apos;hui</DefinitionLink>
            </h2>
            <p className="-mt-1 text-xs text-muted-foreground text-pretty">
              Un état, pas une période : la période ne s&apos;y applique pas (conseiller, type, pipeline et origine, si). Le règlement se déclare
              depuis la pile « commissions à encaisser » du{" "}
              <Link href="/suivi" className="underline underline-offset-2 hover:text-foreground">
                suivi
              </Link>
              .
            </p>
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[32rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    {th("État", "left")}
                    {th("Commissions")}
                    {th("Montant")}
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
              <DefinitionLink id="commissions_aging">Vieillissement des commissions confirmées non réglées</DefinitionLink>
            </h2>
            <p className="-mt-1 text-xs text-muted-foreground text-pretty">
              Depuis la date de confirmation observée.{" "}
              <span className="tabular-nums">{plural(commissions.overdue.n, "commission dépasse", "commissions dépassent")}</span> le seuil de
              relance de l&apos;organisation ({formatDays(commissions.overdue.thresholdDays)})
              {commissions.overdue.n > 0 && <>, {forAmount(commissions.overdue)}</>}
              .
              {commissions.unknownConfirmedAt.n > 0 && (
                <>
                  {" "}
                  <span className="tabular-nums">{plural(commissions.unknownConfirmedAt.n, "confirmée")}</span> à la date inconnue,{" "}
                  {forAmount(commissions.unknownConfirmedAt)} — écartée
                  {commissions.unknownConfirmedAt.n > 1 ? "s" : ""} du vieillissement, jamais datée{commissions.unknownConfirmedAt.n > 1 ? "s" : ""} par une
                  valeur plausible.
                </>
              )}
            </p>
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[32rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    {th("Ancienneté", "left")}
                    {th("Commissions")}
                    {th("Montant")}
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
        Un taux calculé sur moins de {MIN_OBSERVATIONS} observations est masqué ; nombres et montants s&apos;affichent toujours. Les délais de
        réponse bornés sur la date de réponse se lisent dans{" "}
        <Link href="/analytique/delais" className="underline underline-offset-2 hover:text-foreground">
          Analytique → Délais
        </Link>
        ; les seuils de relance se règlent dans{" "}
        <Link href="/settings" className="underline underline-offset-2 hover:text-foreground">
          Marque &amp; réglages
        </Link>
        .
      </p>
    </>
  );
}
