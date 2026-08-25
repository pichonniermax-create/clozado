import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import type { OrgScopeUser } from "@/lib/session";
import {
  contactConditions,
  dealConditions,
  leadOriginCondition,
  ORIGIN_UNKNOWN,
  organizationOf,
  periodCondition,
  type MetricFilters,
} from "./filters";
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

/**
 * METRICS.stage_duration — un résultat par étape INTERMÉDIAIRE (une étape
 * finale ne se quitte pas : rien à mesurer), dans l'ordre des pipelines.
 * `pending` : les passages en cours (l'affaire y est encore aujourd'hui).
 * L'agrégat est calculé UNE fois (`MATERIALIZED`) puis rattaché aux
 * étapes — sans quoi le planificateur le recalcule pour chaque étape.
 */
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
    ),
    agg AS MATERIALIZED (
      SELECT p.to_status_id,
        count(*) FILTER (WHERE ${completed} AND NOT p.reconstructed) AS n,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM p.ended_at - p.started_at))
          FILTER (WHERE ${completed} AND NOT p.reconstructed) AS median_seconds,
        avg(extract(epoch FROM p.ended_at - p.started_at)) FILTER (WHERE ${completed} AND NOT p.reconstructed) AS mean_seconds,
        count(*) FILTER (WHERE ${completed} AND p.reconstructed) AS excluded_reconstructed,
        count(*) FILTER (WHERE p.ended_at IS NULL) AS pending
      FROM passages p
      GROUP BY p.to_status_id
    )
    SELECT st.id AS stage_id, st.label, st.color, st.pipeline_id, st.position,
      coalesce(a.n, 0) AS n, a.median_seconds, a.mean_seconds,
      coalesce(a.excluded_reconstructed, 0) AS excluded_reconstructed, coalesce(a.pending, 0) AS pending
    FROM deal_statuses st
    LEFT JOIN agg a ON a.to_status_id = st.id
    WHERE st.organization_id = ${org} AND st.outcome IS NULL${filters.pipelineId ? sql` AND st.pipeline_id = ${filters.pipelineId}` : sql``}
    ORDER BY st.pipeline_id, st.position, st.created_at
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
      pending: r.pending,
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

/**
 * METRICS.stage_pair_delay — une ligne par paire d'étapes consécutives
 * (la première jamais finale), dans l'ordre des pipelines. Un seul
 * passage sur les données : la première entrée de chaque affaire dans
 * chaque étape, ordonnée par le rang de l'étape dans son pipeline ; une
 * paire est observée quand l'entrée suivante (par rang) est bien l'étape
 * suivante et n'est pas antérieure. L'agrégat est matérialisé puis
 * rattaché aux étapes : une étape sans paire observée sort à n = 0.
 */
export async function stagePairDelays(user: OrgScopeUser, filters: MetricFilters = {}): Promise<StagePairDelay[]> {
  const org = organizationOf(user);
  const result = await rows(sql`
    WITH stages AS (
      SELECT id, label, pipeline_id, position, outcome, created_at,
             lead(id) OVER w AS next_id, lead(label) OVER w AS next_label, row_number() OVER w AS rank
      FROM deal_statuses
      WHERE organization_id = ${org}
      WINDOW w AS (PARTITION BY pipeline_id ORDER BY position, created_at)
    ),
    first_entry AS (
      SELECT s.deal_id, s.to_status_id, min(s.changed_at) AS entered_at
      FROM deal_stage_changes s
      JOIN deals d ON d.id = s.deal_id
      WHERE s.organization_id = ${org} AND NOT s.reconstructed AND ${dealConditions(org, filters)}
      GROUP BY s.deal_id, s.to_status_id
    ),
    ordered AS (
      SELECT fe.entered_at, st.id AS stage_id, st.next_id,
             lead(fe.to_status_id) OVER w AS following_stage, lead(fe.entered_at) OVER w AS following_entered_at
      FROM first_entry fe
      JOIN stages st ON st.id = fe.to_status_id
      WINDOW w AS (PARTITION BY fe.deal_id ORDER BY st.rank)
    ),
    agg AS MATERIALIZED (
      SELECT o.stage_id AS from_id, count(*) AS n,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM o.following_entered_at - o.entered_at)) AS median_seconds,
        avg(extract(epoch FROM o.following_entered_at - o.entered_at)) AS mean_seconds
      FROM ordered o
      WHERE o.following_stage = o.next_id AND o.following_entered_at >= o.entered_at
        AND ${periodCondition(sql`o.following_entered_at`, filters)}
      GROUP BY o.stage_id
    )
    SELECT st.id AS from_id, st.label AS from_label, st.next_id AS to_id, st.next_label AS to_label, st.pipeline_id,
      coalesce(a.n, 0) AS n, a.median_seconds, a.mean_seconds
    FROM stages st
    LEFT JOIN agg a ON a.from_id = st.id
    WHERE st.next_id IS NOT NULL AND st.outcome IS NULL${filters.pipelineId ? sql` AND st.pipeline_id = ${filters.pipelineId}` : sql``}
    ORDER BY st.pipeline_id, st.position, st.created_at
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

/**
 * Les chaînes de renvois de lien — LA définition « un partage = une chaîne,
 * envoyé à la date du premier lien », partagée par les délais et par
 * l'analyse par partenaire : `chain` relie chaque partage à sa racine,
 * `roots` porte la date du PREMIER envoi. À poser après `WITH RECURSIVE`.
 */
export function shareChainsCte(organizationId: string): SQL {
  return sql`chain AS (
      SELECT id, id AS root_id, sent_at, 1 AS depth
      FROM deal_shares
      WHERE organization_id = ${organizationId} AND replaces_share_id IS NULL
      UNION ALL
      SELECT s.id, c.root_id, s.sent_at, c.depth + 1
      FROM deal_shares s
      JOIN chain c ON s.replaces_share_id = c.id
      WHERE s.organization_id = ${organizationId} AND c.depth < 50
    ),
    roots AS (SELECT root_id, min(sent_at) AS first_sent_at FROM chain GROUP BY root_id)`;
}

/** METRICS.share_response_delay — depuis le PREMIER envoi de la chaîne de renvois. */
export async function shareResponseDelay(user: OrgScopeUser, filters: MetricFilters = {}): Promise<DurationStat> {
  const org = organizationOf(user);
  const [r] = await rows(sql`
    WITH RECURSIVE ${shareChainsCte(org)}
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

/**
 * METRICS.lead_to_first_contact — par contact : son PREMIER lead, puis la
 * première interaction effective (appel, email, rendez-vous) consignée à
 * partir de cette arrivée. `pending` : les contacts venus par un lead qui
 * n'ont encore aucune interaction consignée. Les fiches supprimées sont
 * écartées (leurs interactions le sont aussi). Type et pipeline sont sans
 * objet ; le filtre « sans lead » ne laisse rien à mesurer.
 */
export async function leadToFirstContactDelay(user: OrgScopeUser, filters: MetricFilters = {}): Promise<DurationStat> {
  const org = organizationOf(user);
  if (filters.originId === ORIGIN_UNKNOWN) {
    return unavailableStat("Sans objet avec ce filtre : il retient les affaires sans lead, et ce délai part d'un lead.");
  }
  const closed = sql`k.contacted_at IS NOT NULL AND ${periodCondition(sql`k.contacted_at`, filters)}`;
  const [r] = await rows(sql`
    WITH first_lead AS (
      SELECT DISTINCT ON (l.contact_id) l.contact_id, l.received_at, l.origin_id
      FROM leads l
      WHERE l.organization_id = ${org} AND l.contact_id IS NOT NULL
      ORDER BY l.contact_id, l.received_at, l.id
    ),
    candidates AS (
      SELECT fl.received_at, min(a.occurred_at) AS contacted_at
      FROM first_lead fl
      JOIN contacts c ON c.id = fl.contact_id
      LEFT JOIN activities a ON a.organization_id = ${org} AND a.contact_id = fl.contact_id
        AND a.type IN ('call', 'email', 'meeting') AND a.occurred_at >= fl.received_at
      WHERE ${contactConditions(org, filters)} AND c.deleted_at IS NULL
        ${filters.originId ? sql`AND ${leadOriginCondition(sql`fl`, filters.originId)}` : sql``}
      GROUP BY fl.contact_id, fl.received_at
    )
    SELECT count(*) FILTER (WHERE ${closed}) AS n,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM k.contacted_at - k.received_at)) FILTER (WHERE ${closed}) AS median_seconds,
      avg(extract(epoch FROM k.contacted_at - k.received_at)) FILTER (WHERE ${closed}) AS mean_seconds,
      count(*) FILTER (WHERE k.contacted_at IS NULL) AS pending
    FROM candidates k
  `);
  return finishStat({ n: r?.n, medianSeconds: r?.median_seconds, meanSeconds: r?.mean_seconds, pending: r?.pending });
}
