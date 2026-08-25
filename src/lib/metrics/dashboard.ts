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
  | { kind: "euros"; money: AmountCount | MoneyCount; countWord: [string, string]; detail?: string }
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

function plural(n: number, singular: string, pluralForm = `${singular}s`) {
  return `${n} ${n > 1 ? pluralForm : singular}`;
}

export async function dashboardIndicators(
  user: OrgScopeUser,
  ids: readonly DashboardIndicatorId[],
  filters: MetricFilters,
  params: MetricSearchParams
): Promise<DashboardIndicator[]> {
  const wants = (...candidates: DashboardIndicatorId[]) => candidates.some((c) => ids.includes(c));
  const [volumes, losses, partners, leads, creationToWon, leadToFirstContact, shareResponse, commissionSettlement] = await Promise.all([
    wants("deals_created", "deals_won", "won_amount", "pipeline_open") ? volumesReport(user, filters) : null,
    wants("loss_rate", "lost_deal") ? lossesReport(user, filters) : null,
    wants("partner_shares", "partner_acceptance_rate", "partner_transformation_rate", "partner_commissions") ? partnersReport(user, filters) : null,
    wants("funnel_leads") ? leadFunnelCounts(user, filters) : null,
    wants("creation_to_won") ? creationToWonDelay(user, filters) : null,
    wants("lead_to_first_contact") ? leadToFirstContactDelay(user, filters) : null,
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
          value: { kind: "count", n: volumes!.won.n, detail: volumes!.won.withoutAmount > 0 ? `${plural(volumes!.won.withoutAmount, "sans montant", "sans montant")}` : undefined },
          href: href("/analytique/pertes"),
        };
      case "won_amount":
        return { value: { kind: "euros", money: volumes!.won, countWord: ["affaire signée", "affaires signées"] }, href: href("/analytique/pertes") };
      case "pipeline_open":
        return { value: { kind: "euros", money: volumes!.open, countWord: ["affaire en cours", "affaires en cours"] }, href: "/affaires" };
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
          value: { kind: "ratio", rate: losses!.lossRate, detail: `${plural(losses!.total.n, "perdue")} pour ${plural(losses!.won, "signée")}` },
          href: href("/analytique/pertes"),
        };
      case "lost_deal":
        return {
          value: {
            kind: "count",
            n: losses!.total.n,
            detail: losses!.total.n > 0 && losses!.total.withoutAmount < losses!.total.n ? `${formatEurosPlain(losses!.total.amount)} de montant estimé perdu` : undefined,
          },
          href: href("/analytique/pertes"),
        };
      case "funnel_leads":
        return {
          value: leads!.ever ? { kind: "count", n: leads!.leads, detail: `${plural(leads!.contacted, "contact établi", "contacts établis")}` } : { kind: "unavailable", reason: "aucun lead reçu : brancher l'entrée des leads (Marque & réglages → Collecte)" },
          href: href("/analytique/funnel"),
        };
      case "partner_shares":
        return {
          value: { kind: "count", n: partners!.totals.sent, detail: `${plural(partners!.totals.accepted, "accepté")} · ${plural(partners!.totals.declined, "refusé")}` },
          href: href("/analytique/partenaires"),
        };
      case "partner_acceptance_rate":
        return {
          value: { kind: "ratio", rate: partners!.totals.acceptanceRate, detail: `${plural(partners!.totals.accepted, "accepté")} sur ${plural(partners!.totals.sent, "partage envoyé", "partages envoyés")}` },
          href: href("/analytique/partenaires"),
        };
      case "partner_transformation_rate":
        return {
          value: { kind: "ratio", rate: partners!.totals.transformationRate, detail: `${plural(partners!.totals.won, "gagnée")} sur ${plural(partners!.totals.accepted, "partage accepté", "partages acceptés")}` },
          href: href("/analytique/partenaires"),
        };
      case "partner_commissions": {
        const { earned, planned } = partners!.totals;
        return {
          value: {
            kind: "euros",
            money: earned,
            countWord: ["commission acquise", "commissions acquises"],
            detail: planned.n > 0 ? `prévues ${planned.withoutAmount === planned.n ? "au montant inconnu" : formatEurosPlain(planned.amount)} (${planned.n})` : undefined,
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

/** Un montant en euros sans dépendre de l'affichage (la couche ne connaît pas `format.ts`) — pour un détail en texte. */
function formatEurosPlain(amount: number): string {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(amount)} €`;
}
