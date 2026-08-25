import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import type { OrgScopeUser } from "@/lib/session";
import { shareChainsCte } from "./durations";
import { dealConditions, organizationOf, periodCondition, type MetricFilters } from "./filters";
import { finishRate, finishStat, type DurationStat, type RateStat } from "./types";

/**
 * La famille « partenaires et commissions » — le calcul, en SQL, de
 * METRICS.partner_* et commissions_*. Un partage = une chaîne de renvois
 * (`shareChainsCte`, la même définition que les délais) ; son issue, sa
 * réponse et sa commission sont celles de son DERNIER lien. Les partages
 * de la période sont une cohorte (premier envoi dans la période) suivie
 * jusqu'à aujourd'hui ; l'encours de commissions est un état à aujourd'hui,
 * la période ne s'y applique pas. Tout est borné par l'organisation.
 */

type Row = Record<string, unknown>;

async function rows(query: SQL): Promise<Row[]> {
  const result = await db.execute(query);
  return result.rows as Row[];
}

const num = (value: unknown): number => Number(value) || 0;

export type MoneyCount = {
  n: number;
  /** Somme des montants calculés (euros). */
  amount: number;
  /** Lignes sans montant calculé — dans le nombre, pas dans la somme. */
  withoutAmount: number;
};

export type PartnerRow = {
  partnerId: string;
  name: string;
  company: string | null;
  profession: string | null;
  active: boolean;
  sent: number;
  accepted: number;
  declined: number;
  /** Sans réponse : en attente, expiré, révoqué sans réponse. */
  pending: number;
  expired: number;
  revoked: number;
  /** METRICS.partner_acceptance_rate : acceptés / envoyés. */
  acceptanceRate: RateStat;
  /** METRICS.partner_response_delay. */
  responseDelay: DurationStat;
  /** Partages acceptés dont l'affaire est aujourd'hui gagnée. */
  won: number;
  /** METRICS.partner_transformation_rate : gagnées / acceptés. */
  transformationRate: RateStat;
  /** METRICS.partner_commissions : acquises (confirmées + réglées) et prévues vivantes. */
  earned: MoneyCount;
  planned: MoneyCount;
};

export type CommissionStateKey = "prevue" | "confirmee" | "reglee" | "caduque";

export type CommissionStateRow = MoneyCount & { key: CommissionStateKey; label: string };

export type AgingBucket = MoneyCount & { key: string; label: string };

export type PartnersReport = {
  partners: PartnerRow[];
  totals: {
    sent: number;
    accepted: number;
    declined: number;
    noResponse: number;
    won: number;
    acceptanceRate: RateStat;
    transformationRate: RateStat;
    earned: MoneyCount;
    planned: MoneyCount;
  };
  commissions: {
    /** METRICS.commissions_outstanding — prévues, confirmées non réglées, réglées, caduques. */
    states: CommissionStateRow[];
    /** METRICS.commissions_aging — les confirmées non réglées par ancienneté. */
    aging: AgingBucket[];
    unknownConfirmedAt: MoneyCount;
    overdue: MoneyCount & { thresholdDays: number };
  };
};

const STATE_LABELS: Record<CommissionStateKey, string> = {
  prevue: "Prévues (partage en attente ou accepté)",
  confirmee: "Confirmées, non réglées",
  reglee: "Réglées",
  caduque: "Prévues devenues caduques (partage refusé, révoqué, expiré ou remplacé)",
};

const AGING_BUCKETS: { key: string; label: string }[] = [
  { key: "0-30", label: "Confirmée depuis 30 jours ou moins" },
  { key: "31-60", label: "Depuis 31 à 60 jours" },
  { key: "61-90", label: "Depuis 61 à 90 jours" },
  { key: "90+", label: "Depuis plus de 90 jours" },
];

function money(r: Row | undefined): MoneyCount {
  return { n: num(r?.n), amount: num(r?.amount), withoutAmount: num(r?.without_amount) };
}

export async function partnersReport(user: OrgScopeUser, filters: MetricFilters = {}): Promise<PartnersReport> {
  const org = organizationOf(user);
  const responded = sql`sc.issue IN ('accepted', 'declined') AND sc.responded_at IS NOT NULL`;
  const alive = sql`sc.issue IN ('pending', 'accepted')`;
  const [partnerRows, stateRows, agingRows, overdueRows] = await Promise.all([
    rows(sql`
      WITH RECURSIVE ${shareChainsCte(org)},
      last AS (
        SELECT DISTINCT ON (c.root_id) c.root_id, r.first_sent_at, s.id AS share_id, s.status, s.responded_at, s.expires_at, s.partner_id, s.deal_id
        FROM chain c
        JOIN deal_shares s ON s.id = c.id
        JOIN roots r ON r.root_id = c.root_id
        ORDER BY c.root_id, s.sent_at DESC, s.id DESC
      ),
      scoped AS (
        SELECT l.*, cur.outcome AS deal_outcome, cm.state AS commission_state, cm.computed_amount,
          CASE WHEN l.status = 'accepted' THEN 'accepted'
               WHEN l.status = 'declined' THEN 'declined'
               WHEN l.status = 'revoked' THEN 'revoked'
               WHEN l.expires_at IS NOT NULL AND l.expires_at <= now() THEN 'expired'
               ELSE 'pending' END AS issue
        FROM last l
        JOIN deals d ON d.id = l.deal_id
        JOIN deal_statuses cur ON cur.id = d.status_id
        LEFT JOIN commissions cm ON cm.share_id = l.share_id
        WHERE ${dealConditions(org, filters)} AND ${periodCondition(sql`l.first_sent_at`, filters)}
      )
      SELECT p.id, p.name, p.company, p.profession, p.active,
        count(sc.root_id) AS sent,
        count(*) FILTER (WHERE sc.issue = 'accepted') AS accepted,
        count(*) FILTER (WHERE sc.issue = 'declined') AS declined,
        count(*) FILTER (WHERE sc.issue = 'pending') AS pending,
        count(*) FILTER (WHERE sc.issue = 'expired') AS expired,
        count(*) FILTER (WHERE sc.issue = 'revoked') AS revoked,
        count(*) FILTER (WHERE sc.issue = 'accepted' AND sc.deal_outcome = 'won') AS won,
        count(*) FILTER (WHERE ${responded}) AS responded,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM sc.responded_at - sc.first_sent_at)) FILTER (WHERE ${responded}) AS median_seconds,
        avg(extract(epoch FROM sc.responded_at - sc.first_sent_at)) FILTER (WHERE ${responded}) AS mean_seconds,
        count(*) FILTER (WHERE sc.commission_state IN ('confirmee', 'reglee')) AS earned_n,
        coalesce(sum(sc.computed_amount) FILTER (WHERE sc.commission_state IN ('confirmee', 'reglee')), 0) AS earned_amount,
        count(*) FILTER (WHERE sc.commission_state IN ('confirmee', 'reglee') AND sc.computed_amount IS NULL) AS earned_without_amount,
        count(*) FILTER (WHERE sc.commission_state = 'prevue' AND ${alive}) AS planned_n,
        coalesce(sum(sc.computed_amount) FILTER (WHERE sc.commission_state = 'prevue' AND ${alive}), 0) AS planned_amount,
        count(*) FILTER (WHERE sc.commission_state = 'prevue' AND ${alive} AND sc.computed_amount IS NULL) AS planned_without_amount
      FROM partners p
      LEFT JOIN scoped sc ON sc.partner_id = p.id
      WHERE p.organization_id = ${org}
      GROUP BY p.id, p.name, p.company, p.profession, p.active
      ORDER BY sent DESC, p.name
    `),
    rows(sql`
      SELECT CASE WHEN cm.state <> 'prevue' THEN cm.state::text
                  WHEN s.status IN ('declined', 'revoked')
                    OR (s.status = 'pending' AND s.expires_at IS NOT NULL AND s.expires_at <= now())
                    OR EXISTS (SELECT 1 FROM deal_shares r WHERE r.replaces_share_id = s.id) THEN 'caduque'
                  ELSE 'prevue' END AS key,
        count(*) AS n, coalesce(sum(cm.computed_amount), 0) AS amount, count(*) FILTER (WHERE cm.computed_amount IS NULL) AS without_amount
      FROM commissions cm
      JOIN deal_shares s ON s.id = cm.share_id
      JOIN deals d ON d.id = cm.deal_id
      WHERE cm.organization_id = ${org} AND ${dealConditions(org, filters)}
      GROUP BY 1
    `),
    rows(sql`
      SELECT CASE WHEN cm.confirmed_at IS NULL THEN 'inconnue'
                  WHEN now() - cm.confirmed_at <= interval '30 days' THEN '0-30'
                  WHEN now() - cm.confirmed_at <= interval '60 days' THEN '31-60'
                  WHEN now() - cm.confirmed_at <= interval '90 days' THEN '61-90'
                  ELSE '90+' END AS key,
        count(*) AS n, coalesce(sum(cm.computed_amount), 0) AS amount, count(*) FILTER (WHERE cm.computed_amount IS NULL) AS without_amount
      FROM commissions cm
      JOIN deals d ON d.id = cm.deal_id
      WHERE cm.organization_id = ${org} AND cm.state = 'confirmee' AND ${dealConditions(org, filters)}
      GROUP BY 1
    `),
    rows(sql`
      SELECT o.commission_unpaid_days AS threshold_days,
        count(cm.id) AS n, coalesce(sum(cm.computed_amount), 0) AS amount, count(cm.id) FILTER (WHERE cm.computed_amount IS NULL) AS without_amount
      FROM organizations o
      LEFT JOIN commissions cm ON cm.organization_id = o.id AND cm.state = 'confirmee' AND cm.confirmed_at IS NOT NULL
        AND now() - cm.confirmed_at > make_interval(days => o.commission_unpaid_days)
        AND EXISTS (SELECT 1 FROM deals d WHERE d.id = cm.deal_id AND ${dealConditions(org, filters)})
      WHERE o.id = ${org}
      GROUP BY o.commission_unpaid_days
    `),
  ]);

  const partners: PartnerRow[] = partnerRows
    .map((r) => {
      const sent = num(r.sent);
      const accepted = num(r.accepted);
      const won = num(r.won);
      return {
        partnerId: String(r.id),
        name: String(r.name),
        company: (r.company as string | null) ?? null,
        profession: (r.profession as string | null) ?? null,
        active: r.active === true || r.active === "t",
        sent,
        accepted,
        declined: num(r.declined),
        pending: num(r.pending),
        expired: num(r.expired),
        revoked: num(r.revoked),
        acceptanceRate: finishRate(accepted, sent),
        responseDelay: finishStat({ n: r.responded, medianSeconds: r.median_seconds, meanSeconds: r.mean_seconds }),
        won,
        transformationRate: finishRate(won, accepted),
        earned: { n: num(r.earned_n), amount: num(r.earned_amount), withoutAmount: num(r.earned_without_amount) },
        planned: { n: num(r.planned_n), amount: num(r.planned_amount), withoutAmount: num(r.planned_without_amount) },
      };
    })
    // Les partenaires inactifs sans partage dans la période n'ont rien à dire ici.
    .filter((p) => p.active || p.sent > 0);

  const sum = (pick: (p: PartnerRow) => number) => partners.reduce((s, p) => s + pick(p), 0);
  const sumMoney = (pick: (p: PartnerRow) => MoneyCount): MoneyCount => ({
    n: sum((p) => pick(p).n),
    amount: sum((p) => pick(p).amount),
    withoutAmount: sum((p) => pick(p).withoutAmount),
  });

  const overdueRow = overdueRows[0];
  const sent = sum((p) => p.sent);
  const accepted = sum((p) => p.accepted);
  const won = sum((p) => p.won);
  return {
    partners,
    totals: {
      sent,
      accepted,
      declined: sum((p) => p.declined),
      noResponse: sum((p) => p.pending + p.expired + p.revoked),
      won,
      acceptanceRate: finishRate(accepted, sent),
      transformationRate: finishRate(won, accepted),
      earned: sumMoney((p) => p.earned),
      planned: sumMoney((p) => p.planned),
    },
    commissions: {
      states: (Object.keys(STATE_LABELS) as CommissionStateKey[]).map((key) => ({
        key,
        label: STATE_LABELS[key],
        ...money(stateRows.find((r) => r.key === key)),
      })),
      aging: AGING_BUCKETS.map((b) => ({ ...b, ...money(agingRows.find((r) => r.key === b.key)) })),
      unknownConfirmedAt: money(agingRows.find((r) => r.key === "inconnue")),
      overdue: { ...money(overdueRow), thresholdDays: num(overdueRow?.threshold_days) },
    },
  };
}

/** Le rapport contient de la matière : au moins un partage dans la période, ou une commission quel que soit son état. */
export function partnersHasAnyData(report: PartnersReport): boolean {
  return report.totals.sent > 0 || report.commissions.states.some((s) => s.n > 0);
}
