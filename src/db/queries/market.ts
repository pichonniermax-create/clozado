import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  marketIndicatorStatus,
  marketObservations,
  organizationIndicators,
  verifiedFigures,
  type MarketObservation,
  type VerifiedFigure,
} from "@/db/schema";
import { assertOrgAccess } from "@/db/scope";
import type { OrgScopeUser } from "@/lib/session";
import { formatIndicatorValue, getIndicator, MARKET_INDICATORS, type MarketIndicator } from "@/lib/watch/indicators";
import type { Observation } from "@/lib/watch/market-readers";
import { formatPeriod } from "@/lib/watch/periods";
import { AppError } from "@/lib/errors";
import type { TranslatorOf } from "@/i18n/translator";

/**
 * LES CHIFFRES — les observations de marché partagées (`market_observations`,
 * la seule table sans organisation), leur santé, les indicateurs qu'une
 * organisation suit, et la SOURCE UNIQUE des chiffres autorisés
 * (`verified_figures`), où chaque indicateur suivi est copié daté et sourcé.
 * Règle tenue ici : un chiffre sans source ni date n'est pas « complet » —
 * l'écran le dit, le prompt ne le reçoit pas.
 */

function requireOrganization(user: OrgScopeUser): string {
  if (!user.organizationId) throw new AppError("aucune_organisation_selectionnee");
  return user.organizationId;
}

// ---------------------------------------------------------------------------
// Observations partagées et santé
// ---------------------------------------------------------------------------

/** `sourceName` : le nom de la source dans la langue de référence du produit (la table des observations est partagée entre organisations) — l'appelant le prend dans les messages. */
export async function upsertObservation(indicator: MarketIndicator, obs: Observation, sourceName: string): Promise<void> {
  await db
    .insert(marketObservations)
    .values({
      indicatorKey: indicator.key,
      period: obs.period,
      periodStart: obs.periodStart,
      valueText: obs.valueText,
      valueNum: obs.valueNum === null ? null : String(obs.valueNum),
      unit: obs.unit ?? indicator.unit,
      sourceName,
      sourceUrl: indicator.sourceUrl,
      fetchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [marketObservations.indicatorKey, marketObservations.period],
      set: {
        periodStart: obs.periodStart,
        valueText: obs.valueText,
        valueNum: obs.valueNum === null ? null : String(obs.valueNum),
        unit: obs.unit ?? indicator.unit,
        sourceName,
        sourceUrl: indicator.sourceUrl,
        fetchedAt: new Date(),
      },
    });
}

/** La dernière observation de chaque indicateur demandé (une ligne par clé, la période la plus récente). */
export async function getLatestObservations(keys: readonly string[]): Promise<Map<string, MarketObservation>> {
  if (keys.length === 0) return new Map();
  const rows = await db.execute(sql`
    SELECT DISTINCT ON (indicator_key) *
    FROM ${marketObservations}
    WHERE indicator_key IN (${sql.join(keys.map((k) => sql`${k}`), sql`, `)})
    ORDER BY indicator_key, period_start DESC, fetched_at DESC
  `);
  const map = new Map<string, MarketObservation>();
  for (const raw of rows.rows as Record<string, unknown>[]) {
    map.set(String(raw.indicator_key), {
      indicatorKey: String(raw.indicator_key),
      period: String(raw.period),
      periodStart: String(raw.period_start),
      valueText: String(raw.value_text),
      valueNum: raw.value_num === null ? null : String(raw.value_num),
      unit: raw.unit === null ? null : String(raw.unit),
      sourceName: String(raw.source_name),
      sourceUrl: String(raw.source_url),
      fetchedAt: new Date(String(raw.fetched_at)),
    });
  }
  return map;
}

export type IndicatorStatus = typeof marketIndicatorStatus.$inferSelect;

export async function getIndicatorStatuses(keys: readonly string[]): Promise<Map<string, IndicatorStatus>> {
  if (keys.length === 0) return new Map();
  const rows = await db.select().from(marketIndicatorStatus).where(inArray(marketIndicatorStatus.indicatorKey, [...keys]));
  return new Map(rows.map((r) => [r.indicatorKey, r]));
}

/** Après une lecture : réussie (date de succès, erreur effacée) ou échouée (cause lisible, échecs consécutifs) — la dernière observation reste affichée avec sa date. */
export async function markIndicatorResult(key: string, error: string | null): Promise<void> {
  const now = new Date();
  await db
    .insert(marketIndicatorStatus)
    .values({ indicatorKey: key, lastFetchedAt: now, lastOkAt: error ? null : now, lastError: error, consecutiveFailures: error ? 1 : 0 })
    .onConflictDoUpdate({
      target: marketIndicatorStatus.indicatorKey,
      set: error
        ? { lastFetchedAt: now, lastError: error, consecutiveFailures: sql`${marketIndicatorStatus.consecutiveFailures} + 1` }
        : { lastFetchedAt: now, lastOkAt: now, lastError: null, consecutiveFailures: 0 },
    });
}

// ---------------------------------------------------------------------------
// Les indicateurs suivis par une organisation
// ---------------------------------------------------------------------------

export async function listFollowedIndicatorKeys(organizationId: string): Promise<string[]> {
  const rows = await db
    .select({ key: organizationIndicators.indicatorKey })
    .from(organizationIndicators)
    .where(eq(organizationIndicators.organizationId, organizationId))
    .orderBy(asc(organizationIndicators.position), asc(organizationIndicators.createdAt));
  // Une clé retirée du catalogue reste en base mais n'est plus proposée.
  return rows.map((r) => r.key).filter((k) => getIndicator(k) !== null);
}

/** Suit ces indicateurs (idempotent : les clés déjà suivies ou inconnues du catalogue sont ignorées). Rend le nombre ajouté. */
export async function followIndicators(organizationId: string, keys: readonly string[]): Promise<number> {
  const known = keys.filter((k) => getIndicator(k) !== null);
  if (known.length === 0) return 0;
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${organizationIndicators.position}), -1)::int` })
    .from(organizationIndicators)
    .where(eq(organizationIndicators.organizationId, organizationId));
  const inserted = await db
    .insert(organizationIndicators)
    .values(known.map((key, i) => ({ organizationId, indicatorKey: key, position: max + 1 + i })))
    .onConflictDoNothing()
    .returning({ key: organizationIndicators.indicatorKey });
  return inserted.length;
}

export async function followIndicator(user: OrgScopeUser, key: string): Promise<void> {
  const organizationId = requireOrganization(user);
  if (!getIndicator(key)) throw new AppError("cet_indicateur_n_existe_pas");
  await followIndicators(organizationId, [key]);
}

/** Ne suit plus : la ligne d'abonnement ET sa copie dans les chiffres vérifiés (elle était tenue par la collecte, pas à la main). */
export async function unfollowIndicator(user: OrgScopeUser, key: string): Promise<void> {
  const organizationId = requireOrganization(user);
  await db.batch([
    db.delete(organizationIndicators).where(and(eq(organizationIndicators.organizationId, organizationId), eq(organizationIndicators.indicatorKey, key))),
    db.delete(verifiedFigures).where(and(eq(verifiedFigures.organizationId, organizationId), eq(verifiedFigures.indicatorKey, key))),
  ]);
}

/** Les indicateurs du catalogue que l'organisation ne suit pas encore, ceux de son pack d'abord. */
export function proposedIndicators(followed: readonly string[], packKeys: readonly string[]): { pack: MarketIndicator[]; others: MarketIndicator[] } {
  const followedSet = new Set(followed);
  const packSet = new Set(packKeys);
  const pack = packKeys.filter((k) => !followedSet.has(k)).map((k) => getIndicator(k)).filter((i): i is MarketIndicator => i !== null);
  const others = MARKET_INDICATORS.filter((i) => !followedSet.has(i.key) && !packSet.has(i.key));
  return { pack, others };
}

// ---------------------------------------------------------------------------
// La copie datée et sourcée dans les chiffres vérifiés
// ---------------------------------------------------------------------------

/**
 * Pour chaque indicateur suivi qui a une observation : sa ligne dans
 * `verified_figures` — créée ou mise à jour, jamais à la main (clé
 * `indicator_key`, unique par organisation). Rend le nombre de lignes
 * écrites. La valeur est celle qui se cite (« 2,25 % »), la date la
 * période telle que publiée, la source celle du catalogue.
 */
export async function syncIndicatorFigures(organizationId: string, t: TranslatorOf<"figures">): Promise<number> {
  const keys = await listFollowedIndicatorKeys(organizationId);
  const observations = await getLatestObservations(keys);
  let written = 0;
  for (const key of keys) {
    const indicator = getIndicator(key);
    const obs = observations.get(key);
    if (!indicator || !obs) continue;
    const row = {
      label: t(`indicators.${indicator.key}.label`),
      value: formatIndicatorValue(obs.valueText, indicator.unit),
      sourceName: obs.sourceName,
      sourceUrl: obs.sourceUrl,
      asOf: formatPeriod(obs.period, t),
      asOfDate: obs.periodStart,
      updatedAt: new Date(),
    };
    await db
      .insert(verifiedFigures)
      .values({ organizationId, indicatorKey: key, position: 1000 + keys.indexOf(key), ...row })
      .onConflictDoUpdate({
        target: [verifiedFigures.organizationId, verifiedFigures.indicatorKey],
        targetWhere: sql`${verifiedFigures.indicatorKey} IS NOT NULL`,
        set: row,
      });
    written++;
  }
  return written;
}

// ---------------------------------------------------------------------------
// Les chiffres vérifiés — la source unique, avec source et date
// ---------------------------------------------------------------------------

export type VerifiedFigureInput = {
  label: string;
  value: string;
  sourceName: string | null;
  sourceUrl: string | null;
  asOf: string | null;
  /** AAAA-MM-JJ, facultatif (pour trier). */
  asOfDate: string | null;
};

/** Complet = citable par l'IA : une source ET une date. Les lignes d'avant le chantier ont les deux à NULL. */
export function isFigureComplete(figure: Pick<VerifiedFigure, "sourceName" | "asOf">): boolean {
  return Boolean(figure.sourceName?.trim()) && Boolean(figure.asOf?.trim());
}

export async function listVerifiedFigures(user: OrgScopeUser): Promise<VerifiedFigure[]> {
  const organizationId = requireOrganization(user);
  return db
    .select()
    .from(verifiedFigures)
    .where(eq(verifiedFigures.organizationId, organizationId))
    .orderBy(asc(verifiedFigures.position), asc(verifiedFigures.createdAt));
}

/** Les chiffres que le composer peut citer : complets, dans l'ordre — la liste que `getDesignContext` transmet et que la revue vérifie. */
export async function listCitableFigures(organizationId: string): Promise<VerifiedFigure[]> {
  const rows = await db
    .select()
    .from(verifiedFigures)
    .where(and(eq(verifiedFigures.organizationId, organizationId), isNotNull(verifiedFigures.sourceName), isNotNull(verifiedFigures.asOf)))
    .orderBy(asc(verifiedFigures.position), asc(verifiedFigures.createdAt));
  return rows.filter(isFigureComplete);
}

function readFigureInput(input: VerifiedFigureInput): VerifiedFigureInput {
  const label = input.label.trim();
  const value = input.value.trim();
  if (!label) throw new AppError("le_libelle_du_chiffre_est_obligatoire");
  if (!value) throw new AppError("la_valeur_du_chiffre_est_obligatoire");
  if (input.asOfDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.asOfDate)) throw new AppError("la_date_est_illisible");
  return {
    label,
    value,
    sourceName: input.sourceName?.trim() || null,
    sourceUrl: input.sourceUrl?.trim() || null,
    asOf: input.asOf?.trim() || null,
    asOfDate: input.asOfDate || null,
  };
}

export async function createVerifiedFigure(user: OrgScopeUser, input: VerifiedFigureInput): Promise<VerifiedFigure> {
  const organizationId = requireOrganization(user);
  const data = readFigureInput(input);
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${verifiedFigures.position}), -1)::int` })
    .from(verifiedFigures)
    .where(and(eq(verifiedFigures.organizationId, organizationId), sql`${verifiedFigures.position} < 1000`));
  const [row] = await db
    .insert(verifiedFigures)
    .values({ organizationId, position: max + 1, ...data })
    .returning();
  return row;
}

async function getOwnFigure(user: OrgScopeUser, id: string): Promise<VerifiedFigure> {
  const row = await db.query.verifiedFigures.findFirst({ where: eq(verifiedFigures.id, id) });
  if (!row) throw new AppError("chiffre_introuvable", undefined, 404);
  assertOrgAccess(user, row.organizationId);
  return row;
}

export async function updateVerifiedFigure(user: OrgScopeUser, id: string, input: VerifiedFigureInput): Promise<void> {
  const figure = await getOwnFigure(user, id);
  if (figure.indicatorKey) throw new AppError("ce_chiffre_vient_d_un_indicateur_de_e5b0");
  await db
    .update(verifiedFigures)
    .set({ ...readFigureInput(input), updatedAt: new Date() })
    .where(eq(verifiedFigures.id, id));
}

export async function deleteVerifiedFigure(user: OrgScopeUser, id: string): Promise<void> {
  const figure = await getOwnFigure(user, id);
  if (figure.indicatorKey) throw new AppError("ce_chiffre_vient_d_un_indicateur_de_9aa2");
  await db.delete(verifiedFigures).where(eq(verifiedFigures.id, id));
}
