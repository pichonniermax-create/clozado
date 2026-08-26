import type { OrgScopeUser } from "@/lib/session";
import { METRICS, type MetricDefinition } from "./definitions";
import { commissionSettlementDelay, creationToWonDelay, leadToFirstContactDelay, shareResponseDelay } from "./durations";
import type { MetricFilters } from "./filters";
import { leadFunnelCounts } from "./funnel";
import { lossesReport } from "./losses";
import type { DashboardIndicatorId } from "./packs";
import { partnersReport, type MoneyCount } from "./partners";
import { metricQueryString, type MetricSearchParams } from "./search-params";
import type { DurationStat, RateStat } from "./types";
import { volumesReport, type AmountCount } from "./volumes";
import type { TranslatorOf } from "@/i18n/translator";
import type { Formats } from "@/lib/format";

/**
 * Les indicateurs du tableau de bord — UNE valeur par indicateur du pack,
 * lue dans les rapports des familles (jamais un calcul propre au tableau
 * de bord) : les volumes, les délais du cycle, les pertes, la chaîne, les
 * partenaires. Seuls les rapports dont le pack a besoin sont calculés, en
 * parallèle. La règle du seuil est celle des familles (`hidden`) : une
 * tuile masquée dit ce qui lui manque.
 */
export type DashboardValue =
  | { kind: "count"; n: number; detail?: string }
  | { kind: "euros"; money: AmountCount | MoneyCount; countPhrase: string; detail?: string }
  | { kind: "days"; stat: DurationStat }
  | { kind: "ratio"; rate: RateStat; detail: string }
  | { kind: "unavailable"; reason: string };

export type DashboardIndicator = {
  id: DashboardIndicatorId;
  metric: MetricDefinition;
  value: DashboardValue;
  /** L'écran analytique qui détaille l'indicateur, avec la même période. */
  href: string;
  /** Faux pour un état à aujourd'hui (encours) : la période ne s'y applique pas. */
  periodApplies: boolean;
};

const STATE_INDICATORS: readonly DashboardIndicatorId[] = ["pipeline_open"];


export async function dashboardIndicators(
  user: OrgScopeUser,
  ids: readonly DashboardIndicatorId[],
  filters: MetricFilters,
  params: MetricSearchParams,
  t: TranslatorOf<"metrics">
, fmt: Formats): Promise<DashboardIndicator[]> {
  const wants = (...candidates: DashboardIndicatorId[]) => candidates.some((c) => ids.includes(c));
  const [volumes, losses, partners, leads, creationToWon, leadToFirstContact, shareResponse, commissionSettlement] = await Promise.all([
    wants("deals_created", "deals_won", "won_amount", "pipeline_open") ? volumesReport(user, filters) : null,
    wants("loss_rate", "lost_deal") ? lossesReport(user, filters, t) : null,
    wants("partner_shares", "partner_acceptance_rate", "partner_transformation_rate", "partner_commissions") ? partnersReport(user, filters, t) : null,
    wants("funnel_leads") ? leadFunnelCounts(user, filters) : null,
    wants("creation_to_won") ? creationToWonDelay(user, filters) : null,
    wants("lead_to_first_contact") ? leadToFirstContactDelay(user, filters, t) : null,
    wants("share_response_delay") ? shareResponseDelay(user, filters) : null,
    wants("commission_settlement_delay") ? commissionSettlementDelay(user, filters) : null,
  ]);

  const qs = metricQueryString(params);
  const href = (path: string) => `${path}${qs}`;

  const valueOf = (id: DashboardIndicatorId): { value: DashboardValue; href: string } => {
    switch (id) {
      case "deals_created":
        return { value: { kind: "count", n: volumes!.created }, href: href("/analytique/funnel") };
      case "deals_won":
        return {
          value: { kind: "count", n: volumes!.won.n, detail: volumes!.won.withoutAmount > 0 ? `${t("dashboard.sans_montant_sans_montant", { n: volumes!.won.withoutAmount })}` : undefined },
          href: href("/analytique/pertes"),
        };
      case "won_amount":
        return { value: { kind: "euros", money: volumes!.won, countPhrase: t("dashboard.affaire_signee_affaires_signees", { n: volumes!.won.n }) }, href: href("/analytique/pertes") };
      case "pipeline_open":
        return { value: { kind: "euros", money: volumes!.open, countPhrase: t("dashboard.affaire_en_cours_affaires_en_cours", { n: volumes!.open.n }) }, href: "/affaires" };
      case "creation_to_won":
        return { value: { kind: "days", stat: creationToWon! }, href: href("/analytique/delais") };
      case "lead_to_first_contact":
        return { value: { kind: "days", stat: leadToFirstContact! }, href: href("/analytique/delais") };
      case "share_response_delay":
        return { value: { kind: "days", stat: shareResponse! }, href: href("/analytique/delais") };
      case "commission_settlement_delay":
        return { value: { kind: "days", stat: commissionSettlement! }, href: href("/analytique/delais") };
      case "loss_rate":
        return {
          value: { kind: "ratio", rate: losses!.lossRate, detail: t("dashboard.x_pour_y", { lost: t("dashboard.perdue_perdues", { n: losses!.total.n }), won: t("dashboard.signee_signees", { n: losses!.won }) }) },
          href: href("/analytique/pertes"),
        };
      case "lost_deal":
        return {
          value: {
            kind: "count",
            n: losses!.total.n,
            detail: losses!.total.n > 0 && losses!.total.withoutAmount < losses!.total.n ? t("dashboard.de_montant_estime_perdu", { formatEurosPlain: (fmt.money(losses!.total.amount) ?? "") }) : undefined,
          },
          href: href("/analytique/pertes"),
        };
      case "funnel_leads":
        return {
          value: leads!.ever ? { kind: "count", n: leads!.leads, detail: `${t("dashboard.contact_etabli_contacts_etablis", { n: leads!.contacted })}` } : { kind: "unavailable", reason: t("dashboard.aucun_lead_recu_brancher_l_entree_27c0") },
          href: href("/analytique/funnel"),
        };
      case "partner_shares":
        return {
          value: { kind: "count", n: partners!.totals.sent, detail: `${t("dashboard.accepte_acceptes", { n: partners!.totals.accepted })} · ${t("dashboard.refuse_refuses", { n: partners!.totals.declined })}` },
          href: href("/analytique/partenaires"),
        };
      case "partner_acceptance_rate":
        return {
          value: { kind: "ratio", rate: partners!.totals.acceptanceRate, detail: t("dashboard.x_sur_y", { a: t("dashboard.accepte_acceptes", { n: partners!.totals.accepted }), b: t("dashboard.partage_envoye_partages_envoyes", { n: partners!.totals.sent }) }) },
          href: href("/analytique/partenaires"),
        };
      case "partner_transformation_rate":
        return {
          value: { kind: "ratio", rate: partners!.totals.transformationRate, detail: t("dashboard.x_sur_y", { a: t("dashboard.gagnee_gagnees", { n: partners!.totals.won }), b: t("dashboard.partage_accepte_partages_acceptes", { n: partners!.totals.accepted }) }) },
          href: href("/analytique/partenaires"),
        };
      case "partner_commissions": {
        const { earned, planned } = partners!.totals;
        return {
          value: {
            kind: "euros",
            money: earned,
            countPhrase: t("dashboard.commission_acquise_commissions_acquises", { n: earned.n }),
            detail: planned.n > 0 ? t("dashboard.prevues", { value: planned.withoutAmount === planned.n ? t("dashboard.au_montant_inconnu") : (fmt.money(planned.amount) ?? ""), n: planned.n }) : undefined,
          },
          href: href("/analytique/partenaires"),
        };
      }
    }
  };

  return ids.map((id) => {
    const { value, href: target } = valueOf(id);
    return { id, metric: METRICS[id], value, href: target, periodApplies: !STATE_INDICATORS.includes(id) };
  });
}

