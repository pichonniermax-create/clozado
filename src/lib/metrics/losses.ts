import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import type { OrgScopeUser } from "@/lib/session";
import { dealConditions, organizationOf, periodCondition, type MetricFilters } from "./filters";
import { finishRate, type RateStat } from "./types";
import type { TranslatorOf } from "@/i18n/translator";

/**
 * La famille « pertes » — le calcul, en SQL, de METRICS.lost_deal,
 * loss_breakdown et loss_rate. Une perte = une affaire aujourd'hui dans une
 * étape perdue, datée, située et motivée par sa DERNIÈRE entrée dans cette
 * étape (journal des passages). La condition « cette affaire est une perte
 * de la sélection » est exportée pour la liste des affaires : le clic sur
 * une ligne ouvre exactement ce que la ligne compte.
 */

type Row = Record<string, unknown>;

async function rows(query: SQL): Promise<Row[]> {
  const result = await db.execute(query);
  return result.rows as Row[];
}

const num = (value: unknown): number => Number(value) || 0;

/** Valeur spéciale du paramètre `motif` : les pertes sans motif. */
export const LOSS_NO_REASON = "sans-motif";
/** Valeur spéciale du paramètre `depuis` : les affaires nées perdues (aucune étape de départ). */
export const LOST_FROM_CREATION = "creation";
/** Clé de la ligne « sans responsable » — pas de lien : le filtre conseiller ne sait pas dire « personne ». */
export const LOSS_NO_OWNER = "sans-responsable";

export type LossSelection = {
  lossReasonId?: string;
  lostFromStageId?: string;
};

/** La dernière entrée d'UNE affaire (alias fourni) dans une étape perdue — la même règle que l'agrégat (`DISTINCT ON`), formulée par affaire. */
function lastLossSubquery(organizationId: string, d: SQL): SQL {
  return sql`(
    SELECT s.changed_at, s.from_status_id, s.loss_reason_id, s.reconstructed
    FROM deal_stage_changes s
    JOIN deal_statuses st ON st.id = s.to_status_id
    WHERE s.deal_id = ${d}.id AND s.organization_id = ${organizationId} AND st.outcome = 'lost'
    ORDER BY s.changed_at DESC, s.id DESC
    LIMIT 1
  )`;
}

/**
 * METRICS.lost_deal pour UNE affaire : aujourd'hui perdue, dernière perte
 * datée (pas reconstituée) dans la période, motif et étape de départ
 * demandés. C'est ce que la liste applique quand l'URL porte `cohorte=perte`.
 */
export function lostDealCondition(organizationId: string, filters: MetricFilters, selection: LossSelection, d: SQL): SQL {
  const parts: SQL[] = [sql`NOT ll.reconstructed`, periodCondition(sql`ll.changed_at`, filters)];
  if (selection.lossReasonId) {
    parts.push(selection.lossReasonId === LOSS_NO_REASON ? sql`ll.loss_reason_id IS NULL` : sql`ll.loss_reason_id = ${selection.lossReasonId}`);
  }
  if (selection.lostFromStageId) {
    parts.push(
      selection.lostFromStageId === LOST_FROM_CREATION ? sql`ll.from_status_id IS NULL` : sql`ll.from_status_id = ${selection.lostFromStageId}`
    );
  }
  return sql`(
    EXISTS (SELECT 1 FROM deal_statuses w WHERE w.id = ${d}.status_id AND w.outcome = 'lost')
    AND EXISTS (SELECT 1 FROM ${lastLossSubquery(organizationId, d)} ll WHERE ${sql.join(parts, sql` AND `)})
  )`;
}

export type LossBreakdownRow = {
  /** Identifiant de la ligne (motif, étape, conseiller, type) ou valeur spéciale (`sans-motif`, `creation`, `sans-responsable`). */
  key: string;
  label: string;
  n: number;
  /** Somme des montants estimés (euros). */
  amount: number;
  /** Affaires sans montant estimé — dans le nombre, pas dans la somme. */
  withoutAmount: number;
  /** La part du total des pertes — masquée sous le seuil. */
  share: RateStat;
};

export type LossesReport = {
  total: { n: number; amount: number; withoutAmount: number };
  /** Pertes antérieures au journal (ligne reconstituée) : date inconnue, écartées et comptées — montant et affaires sans montant compris. */
  excludedReconstructed: { n: number; amount: number; withoutAmount: number };
  /** Gagnées sur la période, même règle (dernière entrée dans une étape gagnée). */
  won: number;
  /** METRICS.loss_rate : perdues / (perdues + gagnées). */
  lossRate: RateStat;
  byReason: LossBreakdownRow[];
  byStage: LossBreakdownRow[];
  byOwner: LossBreakdownRow[];
  byType: LossBreakdownRow[];
};

/** La dernière entrée de chaque affaire dans une étape d'un marqueur donné. */
export function lastEntryCte(organizationId: string, outcome: "lost" | "won"): SQL {
  return sql`
    SELECT DISTINCT ON (s.deal_id) s.deal_id, s.changed_at, s.from_status_id, s.loss_reason_id, s.reconstructed
    FROM deal_stage_changes s
    JOIN deal_statuses st ON st.id = s.to_status_id
    WHERE s.organization_id = ${organizationId} AND st.outcome = ${outcome}
    ORDER BY s.deal_id, s.changed_at DESC, s.id DESC
  `;
}

/**
 * METRICS.deals_won (et le dénominateur du taux de perte) : les affaires
 * aujourd'hui gagnées dont la DERNIÈRE entrée dans une étape gagnée, datée
 * (pas reconstituée), tombe dans la période — nombre, montant estimé,
 * affaires sans montant. Une seule requête pour les pertes et les volumes.
 */
export function wonDealsQuery(organizationId: string, filters: MetricFilters): SQL {
  return sql`
    WITH last_won AS (${lastEntryCte(organizationId, "won")})
    SELECT count(*) AS n, coalesce(sum(d.estimated_amount), 0) AS amount, count(*) FILTER (WHERE d.estimated_amount IS NULL) AS without_amount
    FROM last_won lw
    JOIN deals d ON d.id = lw.deal_id
    JOIN deal_statuses cur ON cur.id = d.status_id
    WHERE cur.outcome = 'won' AND ${dealConditions(organizationId, filters)} AND NOT lw.reconstructed AND ${periodCondition(sql`lw.changed_at`, filters)}
  `;
}

export async function lossesReport(user: OrgScopeUser, filters: MetricFilters = {}, t: TranslatorOf<"metrics">): Promise<LossesReport> {
  const org = organizationOf(user);
  const measure = sql`count(*) AS n, coalesce(sum(estimated_amount), 0) AS amount, count(*) FILTER (WHERE estimated_amount IS NULL) AS without_amount`;
  const [result, wonRows, reasons, stages, owners, types] = await Promise.all([
    rows(sql`
      WITH last_loss AS (${lastEntryCte(org, "lost")}),
      lost AS (
        SELECT d.id, d.estimated_amount, d.owner_id, d.type_id, ll.changed_at, ll.from_status_id, ll.loss_reason_id, ll.reconstructed
        FROM last_loss ll
        JOIN deals d ON d.id = ll.deal_id
        JOIN deal_statuses cur ON cur.id = d.status_id
        WHERE cur.outcome = 'lost' AND ${dealConditions(org, filters)}
      ),
      in_period AS (SELECT * FROM lost WHERE NOT reconstructed AND ${periodCondition(sql`changed_at`, filters)})
      SELECT 'total' AS kind, NULL::text AS key, ${measure} FROM in_period
      UNION ALL SELECT 'reconstructed', NULL, ${measure} FROM lost WHERE reconstructed
      UNION ALL SELECT 'reason', loss_reason_id::text, ${measure} FROM in_period GROUP BY loss_reason_id
      UNION ALL SELECT 'stage', from_status_id::text, ${measure} FROM in_period GROUP BY from_status_id
      UNION ALL SELECT 'owner', owner_id::text, ${measure} FROM in_period GROUP BY owner_id
      UNION ALL SELECT 'type', type_id::text, ${measure} FROM in_period GROUP BY type_id
    `),
    rows(wonDealsQuery(org, filters)),
    rows(sql`SELECT id, label FROM loss_reasons WHERE organization_id = ${org}`),
    rows(sql`SELECT id, label FROM deal_statuses WHERE organization_id = ${org}`),
    rows(sql`SELECT id, coalesce(name, email) AS label FROM users WHERE organization_id = ${org}`),
    rows(sql`SELECT id, label FROM deal_types WHERE organization_id = ${org}`),
  ]);

  const totalRow = result.find((r) => r.kind === "total");
  const total = { n: num(totalRow?.n), amount: num(totalRow?.amount), withoutAmount: num(totalRow?.without_amount) };
  const reconstructedRow = result.find((r) => r.kind === "reconstructed");
  const won = num(wonRows[0]?.n);

  const labelMap = (list: Row[]) => new Map(list.map((r) => [String(r.id), String(r.label)]));
  const breakdown = (kind: string, labels: Map<string, string>, missing: { key: string; label: string }): LossBreakdownRow[] =>
    result
      .filter((r) => r.kind === kind)
      .map((r) => {
        const key = r.key ? String(r.key) : missing.key;
        return {
          key,
          label: r.key ? (labels.get(key) ?? t("losses.deleted")) : missing.label,
          n: num(r.n),
          amount: num(r.amount),
          withoutAmount: num(r.without_amount),
          share: finishRate(num(r.n), total.n),
        };
      })
      .sort((a, b) => b.n - a.n || b.amount - a.amount || a.label.localeCompare(b.label, "fr"));

  return {
    total,
    excludedReconstructed: { n: num(reconstructedRow?.n), amount: num(reconstructedRow?.amount), withoutAmount: num(reconstructedRow?.without_amount) },
    won,
    lossRate: finishRate(total.n, total.n + won),
    byReason: breakdown("reason", labelMap(reasons), { key: LOSS_NO_REASON, label: t("losses.no_reason") }),
    byStage: breakdown("stage", labelMap(stages), { key: LOST_FROM_CREATION, label: t("losses.from_creation") }),
    byOwner: breakdown("owner", labelMap(owners), { key: LOSS_NO_OWNER, label: t("losses.no_owner") }),
    byType: breakdown("type", labelMap(types), { key: "sans-type", label: t("losses.no_type") }),
  };
}

/** Le rapport contient de la matière : des pertes datées, des pertes écartées, ou des gagnées sur la période. */
export function lossesHasAnyData(report: LossesReport): boolean {
  return report.total.n > 0 || report.excludedReconstructed.n > 0 || report.won > 0;
}
