import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import type { OrgScopeUser } from "@/lib/session";
import { dealConditions, organizationOf, periodCondition, type MetricFilters } from "./filters";
import { wonDealsQuery } from "./losses";

/**
 * La famille « volumes » — le calcul, en SQL, de METRICS.deals_created,
 * deals_won, won_amount et pipeline_open. Les signées viennent de la
 * requête des pertes (`wonDealsQuery`) : une seule règle « signée dans la
 * période » pour le taux de perte, le montant signé et le tableau de bord.
 */

type Row = Record<string, unknown>;

async function rows(query: SQL): Promise<Row[]> {
  const result = await db.execute(query);
  return result.rows as Row[];
}

const num = (value: unknown): number => Number(value) || 0;

export type AmountCount = {
  n: number;
  /** Somme des montants estimés (euros). */
  amount: number;
  /** Affaires sans montant estimé — dans le nombre, pas dans la somme. */
  withoutAmount: number;
};

export type VolumesReport = {
  /** METRICS.deals_created — la cohorte de la période. */
  created: number;
  /** METRICS.deals_won et won_amount — signées dans la période. */
  won: AmountCount;
  /** METRICS.pipeline_open — à aujourd'hui, la période sans effet. */
  open: AmountCount;
};

const amountCount = (r: Row | undefined): AmountCount => ({ n: num(r?.n), amount: num(r?.amount), withoutAmount: num(r?.without_amount) });

/** METRICS.pipeline_open — à aujourd'hui ; la période n'est pas lue. */
export async function openDeals(user: OrgScopeUser, filters: MetricFilters = {}): Promise<AmountCount> {
  const org = organizationOf(user);
  const [r] = await rows(sql`
    SELECT count(*) AS n, coalesce(sum(d.estimated_amount), 0) AS amount, count(*) FILTER (WHERE d.estimated_amount IS NULL) AS without_amount
    FROM deals d
    JOIN deal_statuses cur ON cur.id = d.status_id
    WHERE cur.outcome IS NULL AND ${dealConditions(org, filters)}
  `);
  return amountCount(r);
}

export async function volumesReport(user: OrgScopeUser, filters: MetricFilters = {}): Promise<VolumesReport> {
  const org = organizationOf(user);
  const [created, won, open] = await Promise.all([
    rows(sql`SELECT count(*) AS n FROM deals d WHERE ${dealConditions(org, filters)} AND ${periodCondition(sql`d.created_at`, filters)}`),
    rows(wonDealsQuery(org, filters)),
    openDeals(user, filters),
  ]);
  return { created: num(created[0]?.n), won: amountCount(won[0]), open };
}

/** L'organisation a-t-elle jamais eu une affaire ? (l'état « espace neuf » du tableau de bord) */
export async function hasAnyDeal(user: OrgScopeUser): Promise<boolean> {
  const org = organizationOf(user);
  const [r] = await rows(sql`SELECT EXISTS (SELECT 1 FROM deals d WHERE d.organization_id = ${org}) AS any`);
  return r?.any === true || r?.any === "t";
}
