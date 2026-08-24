import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { OrgScopeUser } from "@/lib/session";
import { METRICS } from "./definitions";
import { dealConditions, organizationOf, periodCondition, type MetricFilters } from "./filters";
import { finishStat, unavailableStat, type DurationStat } from "./types";

/**
 * La famille « délais et durées » — le calcul, en SQL, des métriques
 * définies dans `definitions.ts`. Médianes par `percentile_cont`, jamais
 * en JavaScript ; chaque requête est bornée par l'organisation et lit les
 * tables d'événements, jamais une table entière en mémoire. Les lignes
 * reconstituées (`deal_stage_changes.reconstructed`) et les dates
 * inconnues sont écartées et comptées à part — le registre le dit.
 */

type Row = Record<string, unknown>;

async function rows(query: ReturnType<typeof sql>): Promise<Row[]> {
  const result = await db.execute(query);
  return result.rows as Row[];
}

export type StageDuration = DurationStat & {
  stageId: string;
  label: string;
  color: string | null;
  pipelineId: string;
  position: number;
};

/** METRICS.stage_duration — un résultat par étape, dans l'ordre des pipelines. */
export async function stageDurations(user: OrgScopeUser, filters: MetricFilters = {}): Promise<StageDuration[]> {
  const org = organizationOf(user);
  const completed = sql`p.ended_at IS NOT NULL AND ${periodCondition(sql`p.ended_at`, filters)}`;
  const result = await rows(sql`
    WITH passages AS (
      SELECT s.to_status_id, s.reconstructed, s.changed_at AS started_at,
             lead(s.changed_at) OVER (PARTITION BY s.deal_id ORDER BY s.changed_at, s.id) AS ended_at
      FROM deal_stage_changes s
      JOIN deals d ON d.id = s.deal_id
      WHERE s.organization_id = ${org} AND ${dealConditions(org, filters)}
    )
    SELECT st.id AS stage_id, st.label, st.color, st.pipeline_id, st.position,
      count(*) FILTER (WHERE ${completed} AND NOT p.reconstructed) AS n,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM p.ended_at - p.started_at))
        FILTER (WHERE ${completed} AND NOT p.reconstructed) AS median_seconds,
      avg(extract(epoch FROM p.ended_at - p.started_at)) FILTER (WHERE ${completed} AND NOT p.reconstructed) AS mean_seconds,
      count(*) FILTER (WHERE ${completed} AND p.reconstructed) AS excluded_reconstructed
    FROM deal_statuses st
    LEFT JOIN passages p ON p.to_status_id = st.id
    WHERE st.organization_id = ${org}${filters.pipelineId ? sql` AND st.pipeline_id = ${filters.pipelineId}` : sql``}
    GROUP BY st.id, st.label, st.color, st.pipeline_id, st.position
    ORDER BY st.pipeline_id, st.position
  `);
  return result.map((r) => ({
    stageId: String(r.stage_id),
    label: String(r.label),
    color: (r.color as string | null) ?? null,
    pipelineId: String(r.pipeline_id),
    position: Number(r.position),
    ...finishStat({
      n: r.n,
      medianSeconds: r.median_seconds,
      meanSeconds: r.mean_seconds,
      excludedReconstructed: r.excluded_reconstructed,
    }),
  }));
}

/** METRICS.creation_to_won. */
export async function creationToWonDelay(user: OrgScopeUser, filters: MetricFilters = {}): Promise<DurationStat> {
  const org = organizationOf(user);
  const [r] = await rows(sql`
    WITH won AS (
      SELECT s.deal_id, min(s.changed_at) AS won_at
      FROM deal_stage_changes s
      JOIN deal_statuses st ON st.id = s.to_status_id
      WHERE s.organization_id = ${org} AND st.outcome = 'won' AND NOT s.reconstructed
      GROUP BY s.deal_id
    )
    SELECT count(*) AS n,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM w.won_at - d.created_at)) AS median_seconds,
      avg(extract(epoch FROM w.won_at - d.created_at)) AS mean_seconds
    FROM won w
    JOIN deals d ON d.id = w.deal_id
    WHERE ${dealConditions(org, filters)} AND ${periodCondition(sql`w.won_at`, filters)}
  `);
  return finishStat({ n: r?.n, medianSeconds: r?.median_seconds, meanSeconds: r?.mean_seconds });
}

export type StagePairDelay = DurationStat & {
  fromStageId: string;
  fromLabel: string;
  toStageId: string;
  toLabel: string;
  pipelineId: string;
};

/** METRICS.stage_pair_delay — une ligne par paire d'étapes consécutives, dans l'ordre des pipelines. */
export async function stagePairDelays(user: OrgScopeUser, filters: MetricFilters = {}): Promise<StagePairDelay[]> {
  const org = organizationOf(user);
  const result = await rows(sql`
    WITH first_entry AS (
      SELECT s.deal_id, s.to_status_id, min(s.changed_at) AS entered_at
      FROM deal_stage_changes s
      WHERE s.organization_id = ${org} AND NOT s.reconstructed
      GROUP BY s.deal_id, s.to_status_id
    ),
    stages AS (
      SELECT id, label, pipeline_id, position,
             lead(id) OVER (PARTITION BY pipeline_id ORDER BY position, created_at) AS next_id,
             lead(label) OVER (PARTITION BY pipeline_id ORDER BY position, created_at) AS next_label
      FROM deal_statuses
      WHERE organization_id = ${org}
    )
    SELECT st.id AS from_id, st.label AS from_label, st.next_id AS to_id, st.next_label AS to_label, st.pipeline_id,
      count(b.deal_id) AS n,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM b.entered_at - a.entered_at)) AS median_seconds,
      avg(extract(epoch FROM b.entered_at - a.entered_at)) AS mean_seconds
    FROM stages st
    LEFT JOIN first_entry a ON a.to_status_id = st.id
    LEFT JOIN first_entry b ON b.to_status_id = st.next_id AND b.deal_id = a.deal_id AND b.entered_at >= a.entered_at
    LEFT JOIN deals d ON d.id = b.deal_id AND ${dealConditions(org, filters)} AND ${periodCondition(sql`b.entered_at`, filters)}
    WHERE st.next_id IS NOT NULL${filters.pipelineId ? sql` AND st.pipeline_id = ${filters.pipelineId}` : sql``}
    GROUP BY st.id, st.label, st.next_id, st.next_label, st.pipeline_id, st.position
    ORDER BY st.pipeline_id, st.position
  `);
  return result.map((r) => ({
    fromStageId: String(r.from_id),
    fromLabel: String(r.from_label),
    toStageId: String(r.to_id),
    toLabel: String(r.to_label),
    pipelineId: String(r.pipeline_id),
    ...finishStat({ n: r.n, medianSeconds: r.median_seconds, meanSeconds: r.mean_seconds }),
  }));
}

/** METRICS.share_response_delay — depuis le PREMIER envoi de la chaîne de renvois. */
export async function shareResponseDelay(user: OrgScopeUser, filters: MetricFilters = {}): Promise<DurationStat> {
  const org = organizationOf(user);
  const [r] = await rows(sql`
    WITH RECURSIVE chain AS (
      SELECT id, id AS root_id, sent_at, 1 AS depth
      FROM deal_shares
      WHERE organization_id = ${org} AND replaces_share_id IS NULL
      UNION ALL
      SELECT s.id, c.root_id, s.sent_at, c.depth + 1
      FROM deal_shares s
      JOIN chain c ON s.replaces_share_id = c.id
      WHERE s.organization_id = ${org} AND c.depth < 50
    ),
    roots AS (SELECT root_id, min(sent_at) AS first_sent_at FROM chain GROUP BY root_id)
    SELECT count(*) AS n,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM s.responded_at - r.first_sent_at)) AS median_seconds,
      avg(extract(epoch FROM s.responded_at - r.first_sent_at)) AS mean_seconds
    FROM deal_shares s
    JOIN chain c ON c.id = s.id
    JOIN roots r ON r.root_id = c.root_id
    JOIN deals d ON d.id = s.deal_id
    WHERE s.organization_id = ${org} AND ${dealConditions(org, filters)}
      AND s.status IN ('accepted', 'declined') AND s.responded_at IS NOT NULL
      AND ${periodCondition(sql`s.responded_at`, filters)}
  `);
  return finishStat({ n: r?.n, medianSeconds: r?.median_seconds, meanSeconds: r?.mean_seconds });
}

/** METRICS.commission_settlement_delay — dates observées seulement ; les inconnues sont comptées à part. */
export async function commissionSettlementDelay(user: OrgScopeUser, filters: MetricFilters = {}): Promise<DurationStat> {
  const org = organizationOf(user);
  const known = sql`c.confirmed_at IS NOT NULL`;
  const [r] = await rows(sql`
    SELECT count(*) FILTER (WHERE ${known}) AS n,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM c.settled_at - c.confirmed_at)) FILTER (WHERE ${known}) AS median_seconds,
      avg(extract(epoch FROM c.settled_at - c.confirmed_at)) FILTER (WHERE ${known}) AS mean_seconds,
      count(*) FILTER (WHERE NOT (${known})) AS excluded_unknown
    FROM commissions c
    JOIN deals d ON d.id = c.deal_id
    WHERE c.organization_id = ${org} AND ${dealConditions(org, filters)}
      AND c.state = 'reglee' AND c.settled_at IS NOT NULL
      AND ${periodCondition(sql`c.settled_at`, filters)}
  `);
  return finishStat({
    n: r?.n,
    medianSeconds: r?.median_seconds,
    meanSeconds: r?.mean_seconds,
    excludedUnknown: r?.excluded_unknown,
  });
}

/** METRICS.lead_to_first_contact — indisponible tant que l'entrée des leads n'existe pas (migration B). */
export async function leadToFirstContactDelay(user: OrgScopeUser): Promise<DurationStat> {
  organizationOf(user);
  return unavailableStat(METRICS.lead_to_first_contact.whenInsufficient);
}
