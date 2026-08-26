import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  newsletters,
  newsletterSources,
  watchBasketItems,
  watchItems,
  watchRuns,
  watchSources,
  watchTopics,
  type WatchItem,
  type WatchRun,
  type WatchSource,
  type WatchTopic,
} from "@/db/schema";
import { assertOrgAccess } from "@/db/scope";
import type { BusinessPack } from "@/lib/metrics/packs";
import type { OrgScopeUser } from "@/lib/session";
import type { WatchSourceTemplate, WatchTopicTemplate } from "@/lib/watch/templates";
import { canonicalUrl, urlHash } from "@/lib/watch/url";
import { followIndicators, listFollowedIndicatorKeys } from "./market";

/**
 * LA VEILLE — sujets, sources, articles, panier, collectes. Tout est par
 * organisation ; les fonctions d'écran reçoivent l'utilisateur et
 * exigent son organisation ; les fonctions de collecte reçoivent l'id
 * d'organisation que la collecte a déjà résolu. Ce qui est stocké d'un
 * article : titre, lien, date, éditeur, pays, langue, résumé original —
 * `insertWatchItems` n'a pas de paramètre pour autre chose.
 */

/** Une collecte est périmée au-delà de 24 h : la matière sert des newsletters hebdomadaires, pas un fil d'actualité. */
export const WATCH_STALE_HOURS = 24;
/** Une collecte commencée il y a moins de cinq minutes et non finie bloque un second départ (le verrou est en base, pas en mémoire). */
export const WATCH_LOCK_MINUTES = 5;
/** Le bouton « Actualiser » : une collecte par dix minutes et par organisation. */
export const WATCH_MANUAL_COOLDOWN_MINUTES = 10;
/** Après trente jours d'échecs, une source s'endort : plus interrogée, toujours affichée, réveillable d'un clic. */
export const WATCH_ASLEEP_AFTER_DAYS = 30;
/** Une entrée de flux plus ancienne n'est pas collectée : la veille n'est pas une archive. */
export const WATCH_MAX_ITEM_AGE_DAYS = 60;

function requireOrganization(user: OrgScopeUser): string {
  if (!user.organizationId) throw new Error("Aucune organisation sélectionnée.");
  return user.organizationId;
}

function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } })?.cause;
  return cause?.code === "23505" || (error as { code?: string })?.code === "23505";
}

// ---------------------------------------------------------------------------
// Sujets
// ---------------------------------------------------------------------------

export type WatchTopicInput = { label: string; searchTerms: string[]; searchLanguages: string[] };

function readTopicInput(input: WatchTopicInput): WatchTopicInput {
  const label = input.label.trim();
  if (!label) throw new Error("Le libellé du sujet est obligatoire.");
  const searchTerms = input.searchTerms.map((t) => t.trim()).filter(Boolean);
  const searchLanguages = Array.from(new Set(input.searchLanguages.map((l) => l.trim().toLowerCase()).filter((l) => l === "fr" || l === "en")));
  return { label, searchTerms, searchLanguages: searchLanguages.length ? searchLanguages : ["fr"] };
}

export async function listWatchTopics(organizationId: string, opts: { includeArchived?: boolean } = {}): Promise<WatchTopic[]> {
  const conditions = [eq(watchTopics.organizationId, organizationId)];
  if (!opts.includeArchived) conditions.push(isNull(watchTopics.archivedAt));
  return db
    .select()
    .from(watchTopics)
    .where(and(...conditions))
    .orderBy(asc(watchTopics.position), asc(watchTopics.createdAt));
}

export async function createWatchTopic(user: OrgScopeUser, input: WatchTopicInput): Promise<WatchTopic> {
  const organizationId = requireOrganization(user);
  const data = readTopicInput(input);
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${watchTopics.position}), -1)::int` })
    .from(watchTopics)
    .where(eq(watchTopics.organizationId, organizationId));
  try {
    const [row] = await db
      .insert(watchTopics)
      .values({ organizationId, position: max + 1, ...data })
      .returning();
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(`Le sujet « ${data.label} » existe déjà.`);
    throw error;
  }
}

async function getOwnTopic(user: OrgScopeUser, id: string): Promise<WatchTopic> {
  const row = await db.query.watchTopics.findFirst({ where: eq(watchTopics.id, id) });
  if (!row) throw new Error("Sujet introuvable.");
  assertOrgAccess(user, row.organizationId);
  return row;
}

export async function updateWatchTopic(user: OrgScopeUser, id: string, input: WatchTopicInput): Promise<void> {
  await getOwnTopic(user, id);
  const data = readTopicInput(input);
  try {
    await db.update(watchTopics).set({ ...data, updatedAt: new Date() }).where(eq(watchTopics.id, id));
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error(`Le sujet « ${data.label} » existe déjà.`);
    throw error;
  }
}

/** Un sujet ne se supprime pas (des articles s'y rattachent) : il se désactive. */
export async function archiveWatchTopic(user: OrgScopeUser, id: string): Promise<void> {
  await getOwnTopic(user, id);
  await db.update(watchTopics).set({ archivedAt: new Date(), updatedAt: new Date() }).where(eq(watchTopics.id, id));
}

export async function restoreWatchTopic(user: OrgScopeUser, id: string): Promise<void> {
  await getOwnTopic(user, id);
  await db.update(watchTopics).set({ archivedAt: null, updatedAt: new Date() }).where(eq(watchTopics.id, id));
}

/** Un sujet n'est pas recherché deux fois en vingt heures (le cron du matin le trouve donc dû). */
export const TOPIC_SEARCH_MAX_AGE_HOURS = 20;

export function isTopicSearchDue(topic: Pick<WatchTopic, "lastSearchedAt">, now = new Date()): boolean {
  return !topic.lastSearchedAt || now.getTime() - topic.lastSearchedAt.getTime() > TOPIC_SEARCH_MAX_AGE_HOURS * 3600 * 1000;
}

/** Après une recherche web sur ce sujet : la date, lisible à l'écran (« cherché il y a 3 h ») et dans la base. */
export async function markTopicSearched(topicId: string): Promise<void> {
  await db.update(watchTopics).set({ lastSearchedAt: new Date() }).where(eq(watchTopics.id, topicId));
}

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export type WatchSourceInput = {
  kind: "source" | "competitor";
  label: string;
  siteUrl: string;
  feedUrl: string | null;
  country: string | null;
  lang: string | null;
  topicId: string | null;
};

function readSourceInput(input: WatchSourceInput): WatchSourceInput {
  const label = input.label.trim();
  const siteUrl = canonicalUrl(input.siteUrl.trim().match(/^https?:\/\//i) ? input.siteUrl.trim() : `https://${input.siteUrl.trim()}`);
  if (!siteUrl) throw new Error("L'adresse du site est illisible.");
  const feedUrl = input.feedUrl?.trim() ? canonicalUrl(input.feedUrl.trim()) : null;
  if (input.feedUrl?.trim() && !feedUrl) throw new Error("L'adresse du flux est illisible.");
  const country = input.country?.trim().toUpperCase() || null;
  if (country && !/^[A-Z]{2}$/.test(country)) throw new Error("Le pays s'écrit en deux lettres (FR, GB, US…).");
  const lang = input.lang?.trim().toLowerCase() || null;
  return {
    kind: input.kind === "competitor" ? "competitor" : "source",
    label: label || new URL(siteUrl).hostname.replace(/^www\./, ""),
    siteUrl,
    feedUrl,
    country,
    lang: lang && /^[a-z]{2}$/.test(lang) ? lang : null,
    topicId: input.topicId || null,
  };
}

export async function listWatchSources(
  organizationId: string,
  opts: { kind?: "source" | "competitor"; includeArchived?: boolean } = {}
): Promise<WatchSource[]> {
  const conditions = [eq(watchSources.organizationId, organizationId)];
  if (opts.kind) conditions.push(eq(watchSources.kind, opts.kind));
  if (!opts.includeArchived) conditions.push(isNull(watchSources.archivedAt));
  return db
    .select()
    .from(watchSources)
    .where(and(...conditions))
    .orderBy(asc(watchSources.position), asc(watchSources.createdAt));
}

export async function createWatchSource(user: OrgScopeUser, input: WatchSourceInput): Promise<WatchSource> {
  const organizationId = requireOrganization(user);
  const data = readSourceInput(input);
  if (data.topicId) {
    const topic = await db.query.watchTopics.findFirst({ where: eq(watchTopics.id, data.topicId) });
    if (!topic || topic.organizationId !== organizationId) throw new Error("Sujet introuvable.");
  }
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${watchSources.position}), -1)::int` })
    .from(watchSources)
    .where(eq(watchSources.organizationId, organizationId));
  try {
    const [row] = await db
      .insert(watchSources)
      .values({ organizationId, position: max + 1, ...data })
      .returning();
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error("Ce site est déjà suivi.");
    throw error;
  }
}

async function getOwnSource(user: OrgScopeUser, id: string): Promise<WatchSource> {
  const row = await db.query.watchSources.findFirst({ where: eq(watchSources.id, id) });
  if (!row) throw new Error("Source introuvable.");
  assertOrgAccess(user, row.organizationId);
  return row;
}

export async function archiveWatchSource(user: OrgScopeUser, id: string): Promise<void> {
  await getOwnSource(user, id);
  await db.update(watchSources).set({ archivedAt: new Date(), updatedAt: new Date() }).where(eq(watchSources.id, id));
}

export async function restoreWatchSource(user: OrgScopeUser, id: string): Promise<void> {
  await getOwnSource(user, id);
  await db.update(watchSources).set({ archivedAt: null, updatedAt: new Date() }).where(eq(watchSources.id, id));
}

/** « Réessayer » / « Réveiller » : la source redevient due tout de suite, ses échecs sont remis à zéro. */
export async function retryWatchSource(user: OrgScopeUser, id: string): Promise<void> {
  await getOwnSource(user, id);
  await db
    .update(watchSources)
    .set({ consecutiveFailures: 0, asleepAt: null, lastFetchedAt: null, lastError: null, updatedAt: new Date() })
    .where(eq(watchSources.id, id));
}

/** Le flux découvert (ou corrigé) d'une source. */
export async function setSourceFeed(sourceId: string, feedUrl: string | null): Promise<void> {
  await db.update(watchSources).set({ feedUrl, updatedAt: new Date() }).where(eq(watchSources.id, sourceId));
}

/**
 * Le recul entre deux tentatives sur une source en échec : 1 h, 6 h, puis
 * 24 h et chaque jour (docs §1.1). Une source qui n'a jamais échoué est due
 * dès que sa dernière lecture a plus de `WATCH_STALE_HOURS`, ou n'existe pas.
 */
export function sourceDueAt(source: Pick<WatchSource, "lastFetchedAt" | "consecutiveFailures">): Date | null {
  if (!source.lastFetchedAt) return null;
  const failures = source.consecutiveFailures;
  const hours = failures === 0 ? WATCH_STALE_HOURS : failures === 1 ? 1 : failures === 2 ? 6 : 24;
  return new Date(source.lastFetchedAt.getTime() + hours * 3600 * 1000);
}

export function isSourceDue(source: Pick<WatchSource, "lastFetchedAt" | "consecutiveFailures" | "asleepAt" | "archivedAt">, now = new Date()): boolean {
  if (source.archivedAt || source.asleepAt) return false;
  const due = sourceDueAt(source);
  return due === null || due.getTime() <= now.getTime();
}

export async function recordSourceSuccess(sourceId: string): Promise<void> {
  const now = new Date();
  await db
    .update(watchSources)
    .set({ lastFetchedAt: now, lastOkAt: now, lastError: null, consecutiveFailures: 0, asleepAt: null, updatedAt: now })
    .where(eq(watchSources.id, sourceId));
}

/** Un échec : la cause lisible, un échec de plus ; en sommeil si le dernier succès (ou la création) date de plus de trente jours. */
export async function recordSourceFailure(source: Pick<WatchSource, "id" | "lastOkAt" | "createdAt">, error: string): Promise<void> {
  const now = new Date();
  const reference = source.lastOkAt ?? source.createdAt;
  const asleep = now.getTime() - reference.getTime() > WATCH_ASLEEP_AFTER_DAYS * 24 * 3600 * 1000;
  await db
    .update(watchSources)
    .set({
      lastFetchedAt: now,
      lastError: error.slice(0, 300),
      consecutiveFailures: sql`${watchSources.consecutiveFailures} + 1`,
      ...(asleep ? { asleepAt: now } : {}),
      updatedAt: now,
    })
    .where(eq(watchSources.id, source.id));
}

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

export type NewWatchItemInput = {
  title: string;
  url: string;
  publisher: string;
  publishedAt: Date | null;
  country: string | null;
  lang: string | null;
  sourceId: string | null;
  topicId: string | null;
  discoveredVia: "feed" | "search";
};

/**
 * Insère ce qui n'existe pas encore (URL canonique unique par
 * organisation) ; ce qui existe est ignoré — un même article vu par deux
 * sources compte une fois. Rend le nombre de nouveaux. Aucun corps, aucun
 * extrait : la signature ne le permet pas.
 */
export async function insertWatchItems(organizationId: string, inputs: NewWatchItemInput[]): Promise<number> {
  const rows: (typeof watchItems.$inferInsert)[] = [];
  const seen = new Set<string>();
  const oldest = Date.now() - WATCH_MAX_ITEM_AGE_DAYS * 24 * 3600 * 1000;
  for (const input of inputs) {
    const url = canonicalUrl(input.url);
    const title = input.title.trim();
    if (!url || !title) continue;
    if (input.publishedAt && input.publishedAt.getTime() < oldest) continue;
    const hash = urlHash(url);
    if (seen.has(hash)) continue;
    seen.add(hash);
    rows.push({
      organizationId,
      sourceId: input.sourceId,
      topicId: input.topicId,
      title: title.slice(0, 300),
      url,
      urlHash: hash,
      publisher: input.publisher.trim().slice(0, 120) || "inconnu",
      publishedAt: input.publishedAt,
      country: input.country,
      lang: input.lang,
      discoveredVia: input.discoveredVia,
    });
  }
  if (rows.length === 0) return 0;
  const inserted = await db
    .insert(watchItems)
    .values(rows)
    .onConflictDoNothing({ target: [watchItems.organizationId, watchItems.urlHash] })
    .returning({ id: watchItems.id });
  return inserted.length;
}

export type WatchItemRow = WatchItem & {
  sourceLabel: string | null;
  topicLabel: string | null;
  inBasket: boolean;
  /** Dans combien de newsletters cet article a été utilisé (« déjà utilisé »). */
  usedIn: number;
  /** Dont au moins une marquée envoyée. */
  usedSent: boolean;
};

const ITEM_ORDER = [sql`${watchItems.publishedAt} DESC NULLS LAST`, desc(watchItems.discoveredAt)];

function selectItemRows(organizationId: string, extra: ReturnType<typeof and>[], limit: number) {
  return db
    .select({
      item: watchItems,
      sourceLabel: watchSources.label,
      topicLabel: watchTopics.label,
      inBasket: sql<boolean>`${watchBasketItems.itemId} IS NOT NULL`,
      usedIn: sql<number>`(SELECT count(*)::int FROM ${newsletterSources} ns WHERE ns.item_id = ${watchItems.id} AND ns.organization_id = ${watchItems.organizationId})`,
      usedSent: sql<boolean>`EXISTS (SELECT 1 FROM ${newsletterSources} ns JOIN ${newsletters} n ON n.id = ns.newsletter_id WHERE ns.item_id = ${watchItems.id} AND ns.organization_id = ${watchItems.organizationId} AND n.sent_at IS NOT NULL)`,
    })
    .from(watchItems)
    .leftJoin(watchSources, eq(watchSources.id, watchItems.sourceId))
    .leftJoin(watchTopics, eq(watchTopics.id, watchItems.topicId))
    .leftJoin(watchBasketItems, and(eq(watchBasketItems.itemId, watchItems.id), eq(watchBasketItems.organizationId, watchItems.organizationId)))
    .where(and(eq(watchItems.organizationId, organizationId), ...extra))
    .orderBy(...ITEM_ORDER)
    .limit(limit);
}

function toRow(r: { item: WatchItem; sourceLabel: string | null; topicLabel: string | null; inBasket: boolean; usedIn: number; usedSent: boolean }): WatchItemRow {
  return { ...r.item, sourceLabel: r.sourceLabel, topicLabel: r.topicLabel, inBasket: Boolean(r.inBasket), usedIn: Number(r.usedIn), usedSent: Boolean(r.usedSent) };
}

/** Les articles de l'écran : les plus récents d'abord, sans les écartés, `limit` au plus. */
export async function listWatchItems(user: OrgScopeUser, opts: { includeDismissed?: boolean; limit?: number } = {}): Promise<WatchItemRow[]> {
  const organizationId = requireOrganization(user);
  const extra = opts.includeDismissed ? [] : [isNull(watchItems.dismissedAt)];
  const rows = await selectItemRows(organizationId, extra, opts.limit ?? 200);
  return rows.map(toRow);
}

/** Le panier de l'organisation, dans l'ordre de mise de côté. */
export async function listBasket(user: OrgScopeUser): Promise<WatchItemRow[]> {
  const organizationId = requireOrganization(user);
  const rows = await db
    .select({
      item: watchItems,
      sourceLabel: watchSources.label,
      topicLabel: watchTopics.label,
      inBasket: sql<boolean>`true`,
      usedIn: sql<number>`(SELECT count(*)::int FROM ${newsletterSources} ns WHERE ns.item_id = ${watchItems.id} AND ns.organization_id = ${watchItems.organizationId})`,
      usedSent: sql<boolean>`EXISTS (SELECT 1 FROM ${newsletterSources} ns JOIN ${newsletters} n ON n.id = ns.newsletter_id WHERE ns.item_id = ${watchItems.id} AND ns.organization_id = ${watchItems.organizationId} AND n.sent_at IS NOT NULL)`,
      addedAt: watchBasketItems.addedAt,
    })
    .from(watchBasketItems)
    .innerJoin(watchItems, and(eq(watchItems.id, watchBasketItems.itemId), eq(watchItems.organizationId, watchBasketItems.organizationId)))
    .leftJoin(watchSources, eq(watchSources.id, watchItems.sourceId))
    .leftJoin(watchTopics, eq(watchTopics.id, watchItems.topicId))
    .where(eq(watchBasketItems.organizationId, organizationId))
    .orderBy(asc(watchBasketItems.addedAt));
  return rows.map(toRow);
}

async function getOwnItem(user: OrgScopeUser, id: string): Promise<WatchItem> {
  const row = await db.query.watchItems.findFirst({ where: eq(watchItems.id, id) });
  if (!row) throw new Error("Article introuvable.");
  assertOrgAccess(user, row.organizationId);
  return row;
}

export async function addToBasket(user: OrgScopeUser, itemId: string, addedBy: string | null): Promise<void> {
  const item = await getOwnItem(user, itemId);
  await db.insert(watchBasketItems).values({ organizationId: item.organizationId, itemId: item.id, addedBy }).onConflictDoNothing();
}

export async function removeFromBasket(user: OrgScopeUser, itemId: string): Promise<void> {
  const item = await getOwnItem(user, itemId);
  await db.delete(watchBasketItems).where(and(eq(watchBasketItems.organizationId, item.organizationId), eq(watchBasketItems.itemId, item.id)));
}

export async function clearBasket(user: OrgScopeUser): Promise<void> {
  const organizationId = requireOrganization(user);
  await db.delete(watchBasketItems).where(eq(watchBasketItems.organizationId, organizationId));
}

/** Écarté : masqué (et sorti du panier), jamais supprimé — il reviendrait à la collecte suivante. */
export async function dismissWatchItem(user: OrgScopeUser, itemId: string): Promise<void> {
  const item = await getOwnItem(user, itemId);
  await db.batch([
    db.update(watchItems).set({ dismissedAt: new Date(), updatedAt: new Date() }).where(eq(watchItems.id, item.id)),
    db.delete(watchBasketItems).where(and(eq(watchBasketItems.organizationId, item.organizationId), eq(watchBasketItems.itemId, item.id))),
  ]);
}

export async function restoreWatchItem(user: OrgScopeUser, itemId: string): Promise<void> {
  const item = await getOwnItem(user, itemId);
  await db.update(watchItems).set({ dismissedAt: null, updatedAt: new Date() }).where(eq(watchItems.id, item.id));
}

/** Les articles à résumer, les plus récents d'abord — la collecte en prend autant que son budget le permet. */
export async function listPendingSummaries(organizationId: string, limit: number): Promise<WatchItem[]> {
  const since = new Date(Date.now() - WATCH_MAX_ITEM_AGE_DAYS * 24 * 3600 * 1000);
  return db
    .select()
    .from(watchItems)
    .where(
      and(
        eq(watchItems.organizationId, organizationId),
        eq(watchItems.summaryState, "pending"),
        isNull(watchItems.dismissedAt),
        sql`coalesce(${watchItems.publishedAt}, ${watchItems.discoveredAt}) >= ${since}`
      )
    )
    .orderBy(...ITEM_ORDER)
    .limit(limit);
}

export type SummaryPatch = {
  summaryState: "done" | "refused" | "failed";
  summary: string | null;
  summaryModel: string | null;
  themes: string[];
  angle: string | null;
  lang?: string | null;
  publishedAt?: Date | null;
  topicId?: string | null;
};

export async function saveSummaryResult(itemId: string, patch: SummaryPatch): Promise<void> {
  const set: Partial<typeof watchItems.$inferInsert> = {
    summaryState: patch.summaryState,
    summary: patch.summary,
    summaryModel: patch.summaryModel,
    themes: patch.themes,
    angle: patch.angle,
    updatedAt: new Date(),
  };
  if (patch.lang !== undefined && patch.lang !== null) set.lang = patch.lang;
  if (patch.publishedAt !== undefined && patch.publishedAt !== null) set.publishedAt = patch.publishedAt;
  if (patch.topicId !== undefined && patch.topicId !== null) set.topicId = patch.topicId;
  await db.update(watchItems).set(set).where(eq(watchItems.id, itemId));
}

/** « Résumer à nouveau » : l'article repasse en attente (un résumé refusé ou échoué peut être retenté). */
export async function resetSummary(user: OrgScopeUser, itemId: string): Promise<void> {
  const item = await getOwnItem(user, itemId);
  await db
    .update(watchItems)
    .set({ summaryState: "pending", summary: null, summaryModel: null, updatedAt: new Date() })
    .where(eq(watchItems.id, item.id));
}

// ---------------------------------------------------------------------------
// Collectes — le journal et le verrou
// ---------------------------------------------------------------------------

export type StartRunResult =
  | { status: "started"; run: WatchRun }
  | { status: "running"; run: WatchRun }
  | { status: "cooldown"; until: Date };

/**
 * Démarre une collecte si aucune n'est en cours. Le verrou est GARANTI PAR
 * LA BASE (migration 0014 : une seule ligne ouverte par organisation) ;
 * l'insertion sous condition évite l'exception dans le cas courant, et une
 * violation d'unicité — deux départs strictement simultanés — se lit
 * « déjà en cours ». Une ligne ouverte depuis plus de cinq minutes et
 * jamais finie est close « interrompue » (la fonction a été coupée),
 * sinon le verrou ne se lèverait jamais. Pour le bouton, un délai de dix
 * minutes entre deux départs.
 */
export async function startWatchRun(organizationId: string, trigger: "visit" | "manual" | "cron"): Promise<StartRunResult> {
  await db
    .update(watchRuns)
    .set({ finishedAt: new Date(), error: "Collecte interrompue (délai dépassé)." })
    .where(
      and(
        eq(watchRuns.organizationId, organizationId),
        isNull(watchRuns.finishedAt),
        sql`${watchRuns.startedAt} <= now() - make_interval(mins => ${WATCH_LOCK_MINUTES})`
      )
    );

  const running = await getRunningRun(organizationId);
  if (running) return { status: "running", run: running };

  if (trigger === "manual") {
    const latest = await getLatestRun(organizationId);
    if (latest) {
      const until = new Date(latest.startedAt.getTime() + WATCH_MANUAL_COOLDOWN_MINUTES * 60 * 1000);
      if (until.getTime() > Date.now()) return { status: "cooldown", until };
    }
  }

  let id: string | undefined;
  try {
    const inserted = await db.execute(sql`
      INSERT INTO ${watchRuns} (organization_id, trigger)
      SELECT ${organizationId}::uuid, ${trigger}
      WHERE NOT EXISTS (
        SELECT 1 FROM ${watchRuns}
        WHERE organization_id = ${organizationId}::uuid AND finished_at IS NULL
      )
      RETURNING id
    `);
    id = (inserted.rows[0] as { id?: string } | undefined)?.id;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    id = undefined;
  }
  if (!id) {
    const concurrent = await getRunningRun(organizationId);
    if (concurrent) return { status: "running", run: concurrent };
    throw new Error("La collecte n'a pas pu démarrer.");
  }
  const run = await db.query.watchRuns.findFirst({ where: eq(watchRuns.id, id) });
  if (!run) throw new Error("La collecte n'a pas pu démarrer.");
  return { status: "started", run };
}

/** La collecte ouverte de l'organisation (il ne peut y en avoir qu'une — index partiel unique). */
export async function getRunningRun(organizationId: string): Promise<WatchRun | null> {
  const row = await db.query.watchRuns.findFirst({
    where: and(eq(watchRuns.organizationId, organizationId), isNull(watchRuns.finishedAt)),
    orderBy: desc(watchRuns.startedAt),
  });
  return row ?? null;
}

export async function getLatestRun(organizationId: string): Promise<WatchRun | null> {
  const row = await db.query.watchRuns.findFirst({
    where: eq(watchRuns.organizationId, organizationId),
    orderBy: desc(watchRuns.startedAt),
  });
  return row ?? null;
}

/** La dernière collecte TERMINÉE — c'est elle qui date la matière à l'écran. */
export async function getLatestFinishedRun(organizationId: string): Promise<WatchRun | null> {
  const row = await db.query.watchRuns.findFirst({
    where: and(eq(watchRuns.organizationId, organizationId), sql`${watchRuns.finishedAt} IS NOT NULL`),
    orderBy: desc(watchRuns.startedAt),
  });
  return row ?? null;
}

export async function finishWatchRun(
  runId: string,
  patch: { sourcesOk: number; sourcesFailed: number; itemsNew: number; itemsSummarized: number; error: string | null }
): Promise<void> {
  await db
    .update(watchRuns)
    .set({ finishedAt: new Date(), ...patch, error: patch.error ? patch.error.slice(0, 500) : null })
    .where(eq(watchRuns.id, runId));
}

/** Périmée : aucune collecte terminée depuis 24 h (ou jamais). */
export function isWatchStale(latestFinished: WatchRun | null, now = new Date()): boolean {
  if (!latestFinished?.finishedAt) return true;
  return now.getTime() - latestFinished.finishedAt.getTime() > WATCH_STALE_HOURS * 3600 * 1000;
}

/** Les organisations dont la veille est périmée et qui ont quelque chose à collecter (une source, un sujet ou un indicateur) — pour le cron. */
export async function listStaleOrganizations(limit: number): Promise<string[]> {
  const rows = await db.execute(sql`
    SELECT o.id
    FROM organizations o
    WHERE (
      EXISTS (SELECT 1 FROM ${watchSources} s WHERE s.organization_id = o.id AND s.archived_at IS NULL)
      OR EXISTS (SELECT 1 FROM ${watchTopics} t WHERE t.organization_id = o.id AND t.archived_at IS NULL)
      OR EXISTS (SELECT 1 FROM organization_indicators i WHERE i.organization_id = o.id)
    )
    AND NOT EXISTS (
      SELECT 1 FROM ${watchRuns} r
      WHERE r.organization_id = o.id AND r.finished_at IS NOT NULL
        AND r.finished_at > now() - make_interval(hours => ${WATCH_STALE_HOURS})
    )
    ORDER BY (SELECT max(r.started_at) FROM ${watchRuns} r WHERE r.organization_id = o.id) NULLS FIRST
    LIMIT ${limit}
  `);
  return (rows.rows as { id: string }[]).map((r) => r.id);
}

// ---------------------------------------------------------------------------
// Les valeurs par défaut du métier
// ---------------------------------------------------------------------------

const norm = (s: string) => s.trim().toLowerCase();

export function missingPackWatch(
  pack: BusinessPack,
  topics: Pick<WatchTopic, "label">[],
  sources: Pick<WatchSource, "kind" | "siteUrl">[],
  followedKeys: readonly string[]
): { topics: WatchTopicTemplate[]; sources: WatchSourceTemplate[]; indicators: string[] } {
  const topicLabels = new Set(topics.map((t) => norm(t.label)));
  const siteKeys = new Set(sources.map((s) => `${s.kind}|${canonicalUrl(s.siteUrl) ?? s.siteUrl}`));
  const followed = new Set(followedKeys);
  return {
    topics: pack.watch.topics.filter((t) => !topicLabels.has(norm(t.label))),
    sources: pack.watch.sources.filter((s) => !siteKeys.has(`source|${canonicalUrl(s.siteUrl) ?? s.siteUrl}`)),
    indicators: pack.watch.indicators.filter((k) => !followed.has(k)),
  };
}

/**
 * « Suivre les sujets, sources et indicateurs de mon métier » — idempotent :
 * ne crée que ce qui manque (sujet par libellé, source par site, indicateur
 * par clé), ne touche jamais une ligne existante. Les flux des sources du
 * gabarit sont vérifiés par appel réel dans le gabarit lui-même.
 */
export async function createPackWatchDefaults(
  user: OrgScopeUser,
  pack: BusinessPack
): Promise<{ topics: number; sources: number; indicators: number }> {
  const organizationId = requireOrganization(user);
  const [existingTopics, existingSources, followed] = await Promise.all([
    listWatchTopics(organizationId, { includeArchived: true }),
    listWatchSources(organizationId, { includeArchived: true }),
    listFollowedIndicatorKeys(organizationId),
  ]);
  const missing = missingPackWatch(pack, existingTopics, existingSources, followed);

  const topicIdByLabel = new Map(existingTopics.map((t) => [norm(t.label), t.id]));
  let topicPosition = existingTopics.length;
  for (const template of missing.topics) {
    const [row] = await db
      .insert(watchTopics)
      .values({ organizationId, label: template.label, searchTerms: template.searchTerms, searchLanguages: template.languages, position: topicPosition++ })
      .onConflictDoNothing()
      .returning();
    if (row) topicIdByLabel.set(norm(row.label), row.id);
  }

  let sourcePosition = existingSources.length;
  let createdSources = 0;
  for (const template of missing.sources) {
    const [row] = await db
      .insert(watchSources)
      .values({
        organizationId,
        kind: "source",
        label: template.label,
        siteUrl: canonicalUrl(template.siteUrl) ?? template.siteUrl,
        feedUrl: template.feedUrl,
        country: template.country,
        lang: template.lang,
        topicId: template.topic ? (topicIdByLabel.get(norm(template.topic)) ?? null) : null,
        position: sourcePosition++,
      })
      .onConflictDoNothing()
      .returning();
    if (row) createdSources++;
  }

  const indicators = await followIndicators(organizationId, missing.indicators);
  return { topics: missing.topics.length, sources: createdSources, indicators };
}

/** Les dernières collectes, la plus récente d'abord — le journal de l'écran. */
export async function listRecentRuns(organizationId: string, limit = 5): Promise<WatchRun[]> {
  return db.select().from(watchRuns).where(eq(watchRuns.organizationId, organizationId)).orderBy(desc(watchRuns.startedAt)).limit(limit);
}
