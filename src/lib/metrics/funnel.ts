import { sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import type { OrgScopeUser } from "@/lib/session";
import { METRICS, type MetricDefinition } from "./definitions";
import {
  dealConditions,
  leadOriginCondition,
  ORIGIN_UNKNOWN,
  ORIGIN_UNMATCHED,
  organizationOf,
  periodCondition,
  type MetricFilters,
} from "./filters";
import { lostDealCondition } from "./losses";
import { finishRate, type RateStat } from "./types";
import type { TranslatorOf } from "@/i18n/translator";

/**
 * La famille « funnel » — le calcul, en SQL, des pas définis dans
 * `definitions.ts` : la chaîne continue (visite → simulation → lead →
 * contact établi → affaire → gagnée), le funnel de chaque pipeline (une
 * cohorte d'affaires créées, suivie d'étape en étape jusqu'à aujourd'hui)
 * et la conversion par origine. Chaque requête est bornée par
 * l'organisation. Les comptes s'affichent toujours ; les taux passent par
 * `finishRate` (seuil appliqué une fois). Les conditions qui définissent
 * « a atteint l'étape », « au plus loin dans l'étape », « gagnée / perdue /
 * en cours » sont exportées pour que la LISTE des affaires (cible du clic
 * sur un pas) montre exactement ce que le funnel a compté.
 */

type Row = Record<string, unknown>;

async function rows(query: SQL): Promise<Row[]> {
  const result = await db.execute(query);
  return result.rows as Row[];
}

const num = (value: unknown): number => Number(value) || 0;
const bool = (value: unknown): boolean => value === true || value === "t" || value === "true";

/** Un compte du funnel : toujours affichable — sauf quand le pas est sans objet dans ce contexte (raison en clair). */
export type FunnelCount = { n: number; unavailable?: string };

export type FunnelStep = {
  metric: MetricDefinition;
  count: FunnelCount;
  /** Depuis le dernier pas MESURABLE ; null pour le premier pas mesurable. */
  rate: RateStat | null;
};

/** Les raisons d'un pas « sans objet » vivent dans les messages (`metrics.reasons.*`) : le rapport reçoit le traducteur de l'appelant. */
export type MetricsTranslator = TranslatorOf<"metrics">;

function unavailable(reason: string): FunnelCount {
  return { n: 0, unavailable: reason };
}

/** Les pas dans l'ordre ; le taux de chacun se calcule depuis le dernier pas mesurable. */
function chainSteps(entries: [MetricDefinition, FunnelCount][]): FunnelStep[] {
  let previous: number | null = null;
  return entries.map(([metric, count]) => {
    if (count.unavailable) return { metric, count, rate: null };
    const rate = previous === null ? null : finishRate(count.n, previous);
    previous = count.n;
    return { metric, count, rate };
  });
}

// ---------------------------------------------------------------------------
// Les briques SQL partagées — une seule formulation de chaque règle
// ---------------------------------------------------------------------------

/** Un lead (alias fourni, avec `contact_id` et `received_at`) est « contact établi » : une interaction effective consignée depuis son arrivée. */
export function leadContactedCondition(organizationId: string, lead: SQL): SQL {
  return sql`EXISTS (
    SELECT 1 FROM activities a
    WHERE a.organization_id = ${organizationId} AND a.contact_id = ${lead}.contact_id
      AND a.type IN ('call', 'email', 'meeting') AND a.occurred_at >= ${lead}.received_at
  )`;
}

/** L'affaire (alias fourni) est issue d'un lead reçu dans la période — la cohorte de la chaîne. */
export function leadCohortCondition(organizationId: string, filters: MetricFilters, d: SQL): SQL {
  return sql`${d}.lead_id IN (
    SELECT l.id FROM leads l
    WHERE l.organization_id = ${organizationId} AND ${periodCondition(sql`l.received_at`, filters)}
  )`;
}

/** Le tri des étapes d'un pipeline — le même partout (fenêtres du funnel, comparaisons de la liste). */
const STAGE_ORDER = (alias: SQL) => sql`(${alias}.position, ${alias}.created_at, ${alias}.id)`;

/** L'affaire est aujourd'hui dans une étape marquée « gagné ». */
function currentlyWon(d: SQL): SQL {
  return sql`EXISTS (SELECT 1 FROM deal_statuses w WHERE w.id = ${d}.status_id AND w.outcome = 'won')`;
}

/**
 * METRICS.funnel_stage_reached, pour UNE affaire (alias fourni) : entrée
 * dans l'étape ou dans une étape intermédiaire plus avancée du même
 * pipeline, ou gagnée aujourd'hui ; la première étape du pipeline compte
 * toute affaire. L'étape doit exister, être intermédiaire et appartenir au
 * pipeline de l'affaire — sinon la condition est fausse, jamais « tout ».
 */
export function dealReachedStage(organizationId: string, stageId: string, d: SQL): SQL {
  return sql`EXISTS (
    SELECT 1 FROM deal_statuses x
    WHERE x.id = ${stageId} AND x.organization_id = ${organizationId} AND x.pipeline_id = ${d}.pipeline_id AND x.outcome IS NULL
      AND (
        NOT EXISTS (
          SELECT 1 FROM deal_statuses y
          WHERE y.pipeline_id = x.pipeline_id AND y.outcome IS NULL AND ${STAGE_ORDER(sql`y`)} < ${STAGE_ORDER(sql`x`)}
        )
        OR ${enteredBeyond(organizationId, sql`x`, d, sql`>=`)}
        OR ${currentlyWon(d)}
      )
  )`;
}

/** L'affaire est entrée dans une étape intermédiaire de son pipeline située à/au-delà (`>=`) ou strictement au-delà (`>`) de l'étape `x`. */
function enteredBeyond(organizationId: string, x: SQL, d: SQL, comparator: SQL): SQL {
  return sql`EXISTS (
    SELECT 1 FROM deal_stage_changes s
    JOIN deal_statuses st ON st.id = s.to_status_id
    WHERE s.deal_id = ${d}.id AND s.organization_id = ${organizationId}
      AND st.pipeline_id = ${x}.pipeline_id AND st.outcome IS NULL
      AND ${STAGE_ORDER(sql`st`)} ${comparator} ${STAGE_ORDER(x)}
  )`;
}

/**
 * METRICS.funnel_stage_leak, pour UNE affaire : l'étape est la plus avancée
 * qu'elle ait atteinte, et elle n'est pas gagnée — c'est là qu'elle manque
 * au pas suivant (perdue ou en cours, selon `dealOutcomeCondition`).
 */
export function dealFurthestStage(organizationId: string, stageId: string, d: SQL): SQL {
  return sql`(
    ${dealReachedStage(organizationId, stageId, d)}
    AND NOT EXISTS (
      SELECT 1 FROM deal_statuses x
      WHERE x.id = ${stageId} AND ${enteredBeyond(organizationId, sql`x`, d, sql`>`)}
    )
    AND NOT ${currentlyWon(d)}
  )`;
}

export type DealOutcomeFilter = "gagnee" | "perdue" | "en-cours";

/** METRICS.funnel_won et le complément : l'état COURANT de l'affaire (celui du kanban). */
export function dealOutcomeCondition(outcome: DealOutcomeFilter, d: SQL): SQL {
  const test = outcome === "gagnee" ? sql`w.outcome = 'won'` : outcome === "perdue" ? sql`w.outcome = 'lost'` : sql`w.outcome IS NULL`;
  return sql`EXISTS (SELECT 1 FROM deal_statuses w WHERE w.id = ${d}.status_id AND ${test})`;
}

/**
 * Ce qu'un clic sur un pas du funnel demande à la liste des affaires :
 * les filtres communs, sur quoi porte la période (création de l'affaire
 * pour le funnel d'un pipeline, arrivée du lead pour la chaîne), et les
 * conditions de pas. La liste applique `dealSelectionCondition` telle
 * quelle : elle montre exactement ce que le funnel a compté.
 */
export type DealSelection = {
  filters: MetricFilters;
  /** Sur quoi porte la période : la création de l'affaire, l'arrivée de son lead (la chaîne), ou la date de sa perte (l'analyse des pertes). */
  cohort: "creation" | "lead" | "perte";
  reachedStageId?: string;
  furthestStageId?: string;
  outcome?: DealOutcomeFilter;
  /** Avec la cohorte « perte » : le motif au moment de la perte (ou `sans-motif`) et l'étape de départ (ou `creation`). */
  lossReasonId?: string;
  lostFromStageId?: string;
};

export function dealSelectionCondition(organizationId: string, selection: DealSelection, d: SQL): SQL {
  const parts: SQL[] = [dealConditions(organizationId, selection.filters, d)];
  if (selection.cohort === "perte") {
    parts.push(
      lostDealCondition(organizationId, selection.filters, { lossReasonId: selection.lossReasonId, lostFromStageId: selection.lostFromStageId }, d)
    );
  } else {
    parts.push(
      selection.cohort === "lead"
        ? leadCohortCondition(organizationId, selection.filters, d)
        : periodCondition(sql`${d}.created_at`, selection.filters)
    );
  }
  if (selection.reachedStageId) parts.push(dealReachedStage(organizationId, selection.reachedStageId, d));
  if (selection.furthestStageId) parts.push(dealFurthestStage(organizationId, selection.furthestStageId, d));
  if (selection.outcome) parts.push(dealOutcomeCondition(selection.outcome, d));
  return sql.join(parts, sql` AND `);
}

// ---------------------------------------------------------------------------
// La chaîne continue
// ---------------------------------------------------------------------------

export type FunnelChain = {
  /** Visiteurs, simulations démarrées, terminées, leads reçus, contacts établis, affaires issues de ces leads, gagnées. */
  steps: FunnelStep[];
  /** Leads de la période sans premier contact consigné — ce qui manque au pas « contacts établis ». */
  leadsPending: number;
  /** Les affaires issues des leads de la période : ce qu'elles sont devenues, et dans quel pipeline elles vivent. */
  deals: { lost: number; open: number; byPipeline: { pipelineId: string; label: string; n: number; won: number }[] };
  collection: { everEvents: boolean; everLeads: boolean };
};

async function acquisitionCounts(organizationId: string, filters: MetricFilters) {
  const origin = filters.originId ? leadOriginCondition(sql`e`, filters.originId) : sql`TRUE`;
  const [r] = await rows(sql`
    SELECT (SELECT EXISTS (SELECT 1 FROM acquisition_events x WHERE x.organization_id = ${organizationId})) AS ever,
      count(DISTINCT e.visitor_id) FILTER (WHERE e.kind = 'visit') AS visitors,
      count(DISTINCT e.visitor_id) FILTER (WHERE e.kind = 'simulation_started') AS started,
      count(DISTINCT e.visitor_id) FILTER (WHERE e.kind = 'simulation_completed') AS completed
    FROM acquisition_events e
    WHERE e.organization_id = ${organizationId} AND ${periodCondition(sql`e.occurred_at`, filters)} AND ${origin}
  `);
  return { ever: bool(r?.ever), visitors: num(r?.visitors), started: num(r?.started), completed: num(r?.completed) };
}

/** La cohorte de leads de la chaîne : reçus dans la période, origine et conseiller (de la fiche) appliqués. */
function leadCohort(organizationId: string, filters: MetricFilters): SQL {
  const origin = filters.originId ? leadOriginCondition(sql`l`, filters.originId) : sql`TRUE`;
  const owner = filters.ownerId ? sql`c.owner_id = ${filters.ownerId}` : sql`TRUE`;
  return sql`
    SELECT l.id, l.contact_id, l.received_at, l.origin_id
    FROM leads l LEFT JOIN contacts c ON c.id = l.contact_id
    WHERE l.organization_id = ${organizationId} AND ${periodCondition(sql`l.received_at`, filters)} AND ${origin} AND ${owner}
  `;
}

/** METRICS.funnel_leads et funnel_contacted, seuls — le même calcul que la chaîne, pour le tableau de bord. */
export async function leadFunnelCounts(user: OrgScopeUser, filters: MetricFilters = {}) {
  return leadCounts(organizationOf(user), filters);
}

async function leadCounts(organizationId: string, filters: MetricFilters) {
  const [r] = await rows(sql`
    WITH cohort AS (${leadCohort(organizationId, filters)})
    SELECT (SELECT EXISTS (SELECT 1 FROM leads x WHERE x.organization_id = ${organizationId})) AS ever,
      count(*) AS leads,
      count(*) FILTER (WHERE ${leadContactedCondition(organizationId, sql`k`)}) AS contacted
    FROM cohort k
  `);
  return { ever: bool(r?.ever), leads: num(r?.leads), contacted: num(r?.contacted) };
}

async function dealsFromLeads(organizationId: string, filters: MetricFilters) {
  return rows(sql`
    SELECT d.pipeline_id, p.label,
      count(*) AS n,
      count(*) FILTER (WHERE st.outcome = 'won') AS won,
      count(*) FILTER (WHERE st.outcome = 'lost') AS lost,
      count(*) FILTER (WHERE st.outcome IS NULL) AS open
    FROM deals d
    JOIN deal_statuses st ON st.id = d.status_id
    JOIN pipelines p ON p.id = d.pipeline_id
    WHERE ${dealConditions(organizationId, filters)} AND ${leadCohortCondition(organizationId, filters, sql`d`)}
    GROUP BY d.pipeline_id, p.label, p.position, p.created_at
    ORDER BY p.position, p.created_at
  `);
}

export async function funnelChain(user: OrgScopeUser, filters: MetricFilters = {}, t: MetricsTranslator): Promise<FunnelChain> {
  const org = organizationOf(user);
  const [acq, lead, dealRows] = await Promise.all([
    acquisitionCounts(org, filters),
    leadCounts(org, filters),
    dealsFromLeads(org, filters),
  ]);
  const byPipeline = dealRows.map((r) => ({
    pipelineId: String(r.pipeline_id),
    label: String(r.label),
    n: num(r.n),
    won: num(r.won),
  }));
  const deals = {
    n: byPipeline.reduce((s, p) => s + p.n, 0),
    won: byPipeline.reduce((s, p) => s + p.won, 0),
    lost: dealRows.reduce((s, r) => s + num(r.lost), 0),
    open: dealRows.reduce((s, r) => s + num(r.open), 0),
  };

  const originUnknown = filters.originId === ORIGIN_UNKNOWN;
  const upstreamReason = originUnknown ? t("reasons.origin_unknown") : !acq.ever ? t("reasons.no_events") : filters.ownerId ? t("reasons.owner") : undefined;
  const leadReason = originUnknown ? t("reasons.origin_unknown") : !lead.ever ? t("reasons.no_leads") : undefined;
  const count = (reason: string | undefined, n: number): FunnelCount => (reason ? unavailable(reason) : { n });

  return {
    steps: chainSteps([
      [METRICS.funnel_visitors, count(upstreamReason, acq.visitors)],
      [METRICS.funnel_simulations_started, count(upstreamReason, acq.started)],
      [METRICS.funnel_simulations_completed, count(upstreamReason, acq.completed)],
      [METRICS.funnel_leads, count(leadReason, lead.leads)],
      [METRICS.funnel_contacted, count(leadReason, lead.contacted)],
      [METRICS.funnel_deals_from_leads, count(leadReason, deals.n)],
      [METRICS.funnel_won, count(leadReason, deals.won)],
    ]),
    leadsPending: leadReason ? 0 : lead.leads - lead.contacted,
    deals: { lost: deals.lost, open: deals.open, byPipeline },
    collection: { everEvents: acq.ever, everLeads: lead.ever },
  };
}

// ---------------------------------------------------------------------------
// Le funnel de chaque pipeline — une cohorte d'affaires créées
// ---------------------------------------------------------------------------

export type PipelineFunnelStage = {
  stageId: string;
  label: string;
  color: string | null;
  /** METRICS.funnel_stage_reached. */
  reached: number;
  /** Depuis l'étape précédente ; null sur la première (c'est la cohorte). */
  rate: RateStat | null;
  /** METRICS.funnel_stage_leak : perdues depuis cette étape, encore en cours au plus loin ici. */
  lostHere: number;
  openHere: number;
};

export type PipelineFunnel = {
  pipelineId: string;
  label: string;
  /** La cohorte : affaires créées dans la période, filtres appliqués. */
  created: number;
  createdFromLead: number;
  won: number;
  /** Gagnées rapportées à la dernière étape intermédiaire atteinte. */
  wonRate: RateStat | null;
  lost: number;
  open: number;
  stages: PipelineFunnelStage[];
};

export async function pipelineFunnels(user: OrgScopeUser, filters: MetricFilters = {}): Promise<PipelineFunnel[]> {
  const org = organizationOf(user);
  const result = await rows(pipelineFunnelQuery(org, filters));
  return assemblePipelineFunnels(result);
}

/** La requête du funnel par pipeline, exposée pour les mesures (EXPLAIN) — jamais appelée par un écran. */
export function pipelineFunnelQuery(org: string, filters: MetricFilters): SQL {
  return sql`
    WITH stages AS (
      SELECT st.id, st.pipeline_id, st.label, st.color, st.position, st.created_at,
             row_number() OVER (PARTITION BY st.pipeline_id ORDER BY st.position, st.created_at, st.id) AS rank
      FROM deal_statuses st
      WHERE st.organization_id = ${org} AND st.outcome IS NULL
    ),
    cohort AS (
      SELECT d.id, d.pipeline_id, cur.outcome AS current_outcome, (d.lead_id IS NOT NULL) AS has_lead
      FROM deals d
      JOIN deal_statuses cur ON cur.id = d.status_id
      WHERE ${dealConditions(org, filters)} AND ${periodCondition(sql`d.created_at`, filters)}
    ),
    progress AS MATERIALIZED (
      SELECT k.id AS deal_id, k.pipeline_id, k.current_outcome, k.has_lead, coalesce(max(st.rank), 1) AS furthest
      FROM cohort k
      LEFT JOIN deal_stage_changes s ON s.deal_id = k.id AND s.organization_id = ${org}
      LEFT JOIN stages st ON st.id = s.to_status_id
      GROUP BY k.id, k.pipeline_id, k.current_outcome, k.has_lead
    )
    SELECT p.id AS pipeline_id, p.label AS pipeline_label, st.id AS stage_id, st.label, st.color, st.rank,
      count(pr.deal_id) AS created,
      count(pr.deal_id) FILTER (WHERE pr.has_lead) AS created_from_lead,
      count(pr.deal_id) FILTER (WHERE pr.current_outcome = 'won') AS won,
      count(pr.deal_id) FILTER (WHERE pr.current_outcome = 'lost') AS lost,
      count(pr.deal_id) FILTER (WHERE pr.current_outcome IS NULL) AS open,
      count(pr.deal_id) FILTER (WHERE st.rank = 1 OR pr.furthest >= st.rank OR pr.current_outcome = 'won') AS reached,
      count(pr.deal_id) FILTER (WHERE pr.furthest = st.rank AND pr.current_outcome = 'lost') AS lost_here,
      count(pr.deal_id) FILTER (WHERE pr.furthest = st.rank AND pr.current_outcome IS NULL) AS open_here
    FROM pipelines p
    JOIN stages st ON st.pipeline_id = p.id
    LEFT JOIN progress pr ON pr.pipeline_id = p.id
    WHERE p.organization_id = ${org}${filters.pipelineId ? sql` AND p.id = ${filters.pipelineId}` : sql``}
    GROUP BY p.id, p.label, p.position, p.created_at, st.id, st.label, st.color, st.rank
    ORDER BY p.position, p.created_at, st.rank
  `;
}

function assemblePipelineFunnels(result: Row[]): PipelineFunnel[] {
  const funnels: PipelineFunnel[] = [];
  for (const r of result) {
    const pipelineId = String(r.pipeline_id);
    let funnel = funnels.find((f) => f.pipelineId === pipelineId);
    if (!funnel) {
      funnel = {
        pipelineId,
        label: String(r.pipeline_label),
        created: num(r.created),
        createdFromLead: num(r.created_from_lead),
        won: num(r.won),
        wonRate: null,
        lost: num(r.lost),
        open: num(r.open),
        stages: [],
      };
      funnels.push(funnel);
    }
    const previous = funnel.stages[funnel.stages.length - 1];
    const reached = num(r.reached);
    funnel.stages.push({
      stageId: String(r.stage_id),
      label: String(r.label),
      color: (r.color as string | null) ?? null,
      reached,
      rate: previous ? finishRate(reached, previous.reached) : null,
      lostHere: num(r.lost_here),
      openHere: num(r.open_here),
    });
  }
  for (const funnel of funnels) {
    const last = funnel.stages[funnel.stages.length - 1];
    funnel.wonRate = last ? finishRate(funnel.won, last.reached) : null;
  }
  return funnels;
}

// ---------------------------------------------------------------------------
// La conversion par origine
// ---------------------------------------------------------------------------

export type OriginFunnelRow = {
  /** L'identifiant de l'origine configurée, ou une valeur spéciale du filtre (`a-rapprocher`, `inconnue`). */
  key: string;
  label: string;
  visitors: FunnelCount;
  started: FunnelCount;
  completed: FunnelCount;
  leads: FunnelCount;
  contacted: FunnelCount;
  deals: FunnelCount;
  won: FunnelCount;
  leadToDeal: RateStat | null;
  dealToWon: RateStat | null;
};

export async function funnelByOrigin(user: OrgScopeUser, filters: MetricFilters = {}, t: MetricsTranslator): Promise<OriginFunnelRow[]> {
  const org = organizationOf(user);
  const eventOrigin = filters.originId ? leadOriginCondition(sql`e`, filters.originId) : sql`TRUE`;
  const [origins, events, leads, deals] = await Promise.all([
    rows(sql`SELECT id, label FROM origins WHERE organization_id = ${org} ORDER BY position, label`),
    rows(sql`
      SELECT e.origin_id,
        count(DISTINCT e.visitor_id) FILTER (WHERE e.kind = 'visit') AS visitors,
        count(DISTINCT e.visitor_id) FILTER (WHERE e.kind = 'simulation_started') AS started,
        count(DISTINCT e.visitor_id) FILTER (WHERE e.kind = 'simulation_completed') AS completed
      FROM acquisition_events e
      WHERE e.organization_id = ${org} AND ${periodCondition(sql`e.occurred_at`, filters)} AND ${eventOrigin}
      GROUP BY e.origin_id
    `),
    rows(sql`
      WITH cohort AS (${leadCohort(org, filters)})
      SELECT k.origin_id, count(*) AS leads, count(*) FILTER (WHERE ${leadContactedCondition(org, sql`k`)}) AS contacted
      FROM cohort k
      GROUP BY k.origin_id
    `),
    rows(sql`
      SELECT l.origin_id, (d.lead_id IS NULL) AS no_lead,
        count(*) AS n, count(*) FILTER (WHERE st.outcome = 'won') AS won
      FROM deals d
      JOIN deal_statuses st ON st.id = d.status_id
      LEFT JOIN leads l ON l.id = d.lead_id
      WHERE ${dealConditions(org, filters)}
        AND ((d.lead_id IS NOT NULL AND ${periodCondition(sql`l.received_at`, filters)})
          OR (d.lead_id IS NULL AND ${periodCondition(sql`d.created_at`, filters)}))
      GROUP BY l.origin_id, (d.lead_id IS NULL)
    `),
  ]);

  type Acc = { visitors: number; started: number; completed: number; leads: number; contacted: number; deals: number; won: number };
  const blank = (): Acc => ({ visitors: 0, started: 0, completed: 0, leads: 0, contacted: 0, deals: 0, won: 0 });
  const acc = new Map<string, Acc>();
  const get = (key: string) => {
    let a = acc.get(key);
    if (!a) acc.set(key, (a = blank()));
    return a;
  };
  const keyOf = (originId: unknown) => (originId ? String(originId) : ORIGIN_UNMATCHED);
  for (const r of events) Object.assign(get(keyOf(r.origin_id)), { visitors: num(r.visitors), started: num(r.started), completed: num(r.completed) });
  for (const r of leads) Object.assign(get(keyOf(r.origin_id)), { leads: num(r.leads), contacted: num(r.contacted) });
  for (const r of deals) {
    const a = get(bool(r.no_lead) ? ORIGIN_UNKNOWN : keyOf(r.origin_id));
    a.deals += num(r.n);
    a.won += num(r.won);
  }

  const labels = new Map<string, string>(origins.map((o) => [String(o.id), String(o.label)]));
  labels.set(ORIGIN_UNMATCHED, t("origins.unmatched"));
  labels.set(ORIGIN_UNKNOWN, t("origins.unknown"));
  // Toutes les origines configurées (une origine à zéro est une information), les deux lignes
  // spéciales seulement si elles portent quelque chose — et, avec un filtre origine, cette ligne seule.
  const keys = [...labels.keys()].filter((key) => {
    if (filters.originId) return key === filters.originId;
    const a = acc.get(key);
    if (key === ORIGIN_UNMATCHED || key === ORIGIN_UNKNOWN) return Boolean(a && Object.values(a).some((v) => v > 0));
    return true;
  });

  const result = keys.map((key): OriginFunnelRow => {
    const a = acc.get(key) ?? blank();
    const upstream = (n: number): FunnelCount =>
      key === ORIGIN_UNKNOWN ? unavailable(t("reasons.no_lead_row")) : filters.ownerId ? unavailable(t("reasons.owner")) : { n };
    const leadSide = (n: number): FunnelCount => (key === ORIGIN_UNKNOWN ? unavailable(t("reasons.no_lead_row")) : { n });
    const leadsCount = leadSide(a.leads);
    return {
      key,
      label: labels.get(key)!,
      visitors: upstream(a.visitors),
      started: upstream(a.started),
      completed: upstream(a.completed),
      leads: leadsCount,
      contacted: leadSide(a.contacted),
      deals: { n: a.deals },
      won: { n: a.won },
      leadToDeal: leadsCount.unavailable ? null : finishRate(a.deals, a.leads),
      dealToWon: finishRate(a.won, a.deals),
    };
  });
  return result.sort(
    (x, y) =>
      y.won.n - x.won.n || y.deals.n - x.deals.n || y.leads.n - x.leads.n || y.visitors.n - x.visitors.n || x.label.localeCompare(y.label, "fr")
  );
}

// ---------------------------------------------------------------------------
// Le rapport entier — l'écran l'affiche, l'export l'écrira
// ---------------------------------------------------------------------------

export type FunnelReport = {
  chain: FunnelChain;
  pipelines: PipelineFunnel[];
  origins: OriginFunnelRow[];
};

export async function funnelReport(user: OrgScopeUser, filters: MetricFilters = {}, t: MetricsTranslator): Promise<FunnelReport> {
  const [chain, pipelines, origins] = await Promise.all([
    funnelChain(user, filters, t),
    pipelineFunnels(user, filters),
    funnelByOrigin(user, filters, t),
  ]);
  return { chain, pipelines, origins };
}

/** Le rapport contient au moins un compte non nul — sinon l'écran montre l'inventaire de ce qui crée une observation. */
export function funnelHasAnyData(report: FunnelReport): boolean {
  return (
    report.chain.steps.some((s) => !s.count.unavailable && s.count.n > 0) ||
    report.pipelines.some((p) => p.created > 0)
  );
}
