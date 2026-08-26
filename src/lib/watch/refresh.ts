import type { WatchRun, WatchSource, WatchTopic } from "@/db/schema";
import {
  followIndicators,
  getIndicatorStatuses,
  listFollowedIndicatorKeys,
  markIndicatorResult,
  syncIndicatorFigures,
  upsertObservation,
} from "@/db/queries/market";
import {
  finishWatchRun,
  insertWatchItems,
  isSourceDue,
  isTopicSearchDue,
  listPendingSummaries,
  markTopicSearched,
  listWatchSources,
  listWatchTopics,
  recordSourceFailure,
  recordSourceSuccess,
  saveSummaryResult,
  startWatchRun,
  type NewWatchItemInput,
  type StartRunResult,
} from "@/db/queries/watch";
import { AINotConfiguredError, getAIProvider, type AIProvider } from "@/lib/ai";
import { fetchArticle } from "./extract";
import { fetchFeed } from "./feeds";
import { getIndicator, MARKET_INDICATORS } from "./indicators";
import { readIndicator } from "./market-readers";
import { findCopiedPassage } from "./originality";
import { countryFromHost, hostOf } from "./url";
import { localeOfOrganization } from "@/i18n/locale";
import { DEFAULT_LOCALE } from "@/i18n/locales";
import { translatorFor } from "@/i18n/translator";
import type { TranslatorOf } from "@/i18n/translator";
import { WatchFetchError, type WatchHttpReason } from "./http";
import { settingsOfOrganization } from "@/i18n/locale-lookup";
import { createFormats } from "@/lib/format";

/**
 * LA COLLECTE — un seul chemin de code, trois déclencheurs (à la visite,
 * le bouton, le cron ; docs/module-ciblage-contenu.md §1.1) : idempotente,
 * bornée par un budget, et sûre par construction sur le droit d'auteur —
 * le texte d'un article vit le temps du résumé et du contrôle des douze
 * mots, puis est oublié ; `saveSummaryResult` ne reçoit que le résumé.
 *
 * Ordre dans le budget : les indicateurs (quelques secondes), les flux
 * (parallèles, 10 s chacun), puis les recherches web (6 à 10 s : deux par
 * collecte, les sujets jamais cherchés ou cherchés depuis le plus
 * longtemps d'abord — `watch_topics.last_searched_at`) et les résumés
 * (8 à 12 s chacun) tant qu'il reste du temps. Ce qui ne tient pas attend
 * la collecte suivante — jamais une fonction coupée au milieu d'une
 * écriture : chaque étape écrit son résultat dès qu'elle l'a.
 */
export const WATCH_RUN_BUDGET_MS = 120_000;
const SOURCE_TIMEOUT_MS = 10_000;
const FEED_CONCURRENCY = 4;
const MAX_ENTRIES_PER_FEED = 30;
const MAX_SEARCHES_PER_RUN = 2;
const SEARCH_RESERVE_MS = 45_000;
const SUMMARY_RESERVE_MS = 15_000;
const MAX_SUMMARIES_PER_RUN = 12;
const INDICATOR_MAX_AGE_HOURS = 20;

export type WatchRunReport = {
  sourcesOk: number;
  sourcesFailed: number;
  itemsNew: number;
  itemsSummarized: number;
  searches: number;
  indicatorsRead: number;
  error: string | null;
};

/** La cause lisible d'un échec, dans une langue donnée : le code d'une `WatchFetchError` traduit ; tout autre accident → « erreur inconnue » (jamais un message technique brut). */
function readableError(error: unknown, t: TranslatorOf<"watch">): string {
  if (error instanceof WatchFetchError) {
    if (error.code === "http") return t("fetchErrors.http", { status: error.values.status, reason: t(`httpReasons.${error.values.reason as WatchHttpReason}`) });
    return t(`fetchErrors.${error.code}`, error.values);
  }
  return t("fetchErrors.unknown");
}

// ---------------------------------------------------------------------------
// Indicateurs — partagés, une lecture par jour et par indicateur au plus
// ---------------------------------------------------------------------------

/**
 * Lit les indicateurs dont la dernière lecture a plus de `maxAgeHours`
 * (ou jamais faite), un par un, chacun dans son propre try : une API
 * muette n'empêche pas les autres, et laisse la dernière observation
 * affichée avec sa date. Rend le nombre d'indicateurs lus avec succès.
 */
export async function refreshIndicators(keys: readonly string[], opts: { maxAgeHours?: number; force?: boolean } = {}): Promise<number> {
  const unique = Array.from(new Set(keys));
  if (unique.length === 0) return 0;
  const statuses = await getIndicatorStatuses(unique);
  const maxAge = (opts.maxAgeHours ?? INDICATOR_MAX_AGE_HOURS) * 3600 * 1000;
  // La table des observations est partagée entre organisations : le nom de la source, comme la cause d'un échec, y sont dans la langue de référence du produit.
  const catalogue = await translatorFor(DEFAULT_LOCALE, "figures");
  const catalogueWatch = await translatorFor(DEFAULT_LOCALE, "watch");
  let read = 0;
  for (const key of unique) {
    const indicator = getIndicator(key);
    if (!indicator) continue;
    const status = statuses.get(key);
    if (!opts.force && status?.lastFetchedAt && Date.now() - status.lastFetchedAt.getTime() < maxAge) continue;
    try {
      const observation = await readIndicator(indicator);
      await upsertObservation(indicator, observation, catalogue(`indicators.${indicator.key}.sourceName`));
      await markIndicatorResult(key, null);
      read++;
    } catch (error) {
      await markIndicatorResult(key, readableError(error, catalogueWatch));
    }
  }
  return read;
}

/** Les indicateurs suivis par une organisation, rafraîchis si besoin, puis copiés datés et sourcés dans ses chiffres vérifiés. */
export async function refreshOrganizationIndicators(organizationId: string, opts: { force?: boolean } = {}): Promise<number> {
  const keys = await listFollowedIndicatorKeys(organizationId);
  const read = await refreshIndicators(keys, opts);
  // Les chiffres vérifiés de l'organisation s'écrivent dans SA langue.
  const settings = await settingsOfOrganization(organizationId);
  await syncIndicatorFigures(organizationId, await translatorFor(settings.locale, "figures"), createFormats(settings));
  return read;
}

/** Tout le catalogue — pour le cron, qui préchauffe la matière avant les visites. */
export async function refreshAllIndicators(): Promise<number> {
  return refreshIndicators(MARKET_INDICATORS.map((i) => i.key));
}

// ---------------------------------------------------------------------------
// Flux
// ---------------------------------------------------------------------------

async function collectFeed(source: WatchSource, tw: TranslatorOf<"watch">): Promise<{ ok: boolean; itemsNew: number }> {
  if (!source.feedUrl) return { ok: true, itemsNew: 0 };
  try {
    const feed = await fetchFeed(source.feedUrl, SOURCE_TIMEOUT_MS);
    const inputs: NewWatchItemInput[] = feed.entries.slice(0, MAX_ENTRIES_PER_FEED).map((entry) => ({
      title: entry.title,
      url: entry.url,
      publisher: source.label,
      publishedAt: entry.publishedAt,
      country: source.country,
      lang: source.lang,
      sourceId: source.id,
      topicId: source.topicId,
      discoveredVia: "feed",
    }));
    const itemsNew = await insertWatchItems(source.organizationId, inputs);
    await recordSourceSuccess(source.id);
    return { ok: true, itemsNew };
  } catch (error) {
    await recordSourceFailure(source, readableError(error, tw));
    return { ok: false, itemsNew: 0 };
  }
}

/** `n` à la fois, dans l'ordre — assez pour que dix flux tiennent dans le budget, pas assez pour ressembler à une rafale. */
async function inPool<T, R>(items: T[], n: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = items[index++];
      results.push(await work(current));
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return results;
}

// ---------------------------------------------------------------------------
// Recherches web — bornées, en rotation
// ---------------------------------------------------------------------------

type SearchJob = { topic: WatchTopic; lang: "fr" | "en"; source: WatchSource | null; since: Date | null };

/**
 * Les recherches DUES (sujet × langue pas cherché depuis vingt heures, plus
 * les sources sans flux rattachées à un sujet et dues selon leur santé),
 * les plus anciennes d'abord — jamais cherché avant tout. Une date lisible
 * en base plutôt qu'une rotation par compteur (migration 0014).
 */
function searchJobs(topics: WatchTopic[], sources: WatchSource[]): SearchJob[] {
  const jobs: SearchJob[] = [];
  for (const topic of topics) {
    if (!isTopicSearchDue(topic)) continue;
    for (const lang of topic.searchLanguages) {
      if (lang === "fr" || lang === "en") jobs.push({ topic, lang, source: null, since: topic.lastSearchedAt });
    }
  }
  for (const source of sources) {
    if (source.feedUrl || !source.topicId || source.kind !== "source" || !isSourceDue(source)) continue;
    const topic = topics.find((t) => t.id === source.topicId);
    if (topic) jobs.push({ topic, lang: (source.lang === "en" ? "en" : "fr") as "fr" | "en", source, since: source.lastFetchedAt });
  }
  return jobs.sort((a, b) => (a.since?.getTime() ?? 0) - (b.since?.getTime() ?? 0));
}

/** « July 24, 2026 » → date ; un âge relatif (« 3 weeks ago ») n'est pas une date de publication : null. */
function dateFromPageAge(pageAge: string | null): Date | null {
  if (!pageAge || !/^[A-Z][a-z]+ \d{1,2}, \d{4}$/.test(pageAge.trim())) return null;
  const date = new Date(`${pageAge.trim()} 12:00:00 UTC`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateFromIso(iso: string | null): Date | null {
  if (!iso) return null;
  const date = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// eslint-disable-next-line local/no-visible-text -- table de reconnaissance des dates telles que les sources les publient, pas un texte d'interface
const MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
// eslint-disable-next-line local/no-visible-text -- table de reconnaissance des dates telles que les sources les publient, pas un texte d'interface
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** « taux crédit immobilier août 2026 » : le mois courant oriente le moteur vers l'actualité — sans lui, il rend des pages de fond datées de l'an dernier, écartées ensuite par la borne des soixante jours. */
function datedQuery(term: string, lang: "fr" | "en", now = new Date()): string {
  const months = lang === "en" ? MONTHS_EN : MONTHS_FR;
  return `${term} ${months[now.getMonth()]} ${now.getFullYear()}`;
}

async function runSearch(provider: AIProvider, organizationId: string, job: SearchJob): Promise<{ itemsNew: number; searches: number }> {
  const terms = job.topic.searchTerms.length ? job.topic.searchTerms : [job.topic.label];
  // Le terme du jour : un sujet à plusieurs termes les parcourt un par jour — lisible, sans état.
  const query = datedQuery(terms[Math.floor(Date.now() / 86_400_000) % terms.length], job.lang);
  const domain = job.source ? hostOf(job.source.siteUrl) : null;
  const result = await provider.searchArticles({
    query,
    lang: job.lang,
    country: job.lang === "en" ? "GB" : "FR",
    ...(domain ? { allowedDomains: [domain] } : {}),
    maxResults: 10,
  });
  const inputs: NewWatchItemInput[] = result.articles.map((article) => {
    const host = hostOf(article.url);
    return {
      title: article.title,
      url: article.url,
      publisher: job.source?.label ?? host ?? "inconnu",
      publishedAt: dateFromIso(article.publishedAt) ?? dateFromPageAge(article.pageAge),
      country: job.source?.country ?? article.country ?? countryFromHost(host),
      lang: article.lang ?? job.lang,
      sourceId: job.source?.id ?? null,
      topicId: job.topic.id,
      discoveredVia: "search",
    };
  });
  const itemsNew = await insertWatchItems(organizationId, inputs);
  return { itemsNew, searches: result.searches };
}

// ---------------------------------------------------------------------------
// Résumés — lus à l'instant, jamais stockés
// ---------------------------------------------------------------------------

function topicIdForThemes(themes: string[], topics: WatchTopic[]): string | null {
  const byLabel = new Map(topics.map((t) => [t.label.trim().toLowerCase(), t.id]));
  for (const theme of themes) {
    const id = byLabel.get(theme.trim().toLowerCase());
    if (id) return id;
  }
  return null;
}

async function summarizeOne(provider: AIProvider, item: Awaited<ReturnType<typeof listPendingSummaries>>[number], topics: WatchTopic[], tw: TranslatorOf<"watch">): Promise<boolean> {
  const topicLabels = topics.map((t) => t.label);
  let text: string | undefined;
  let pageDate: Date | null = null;
  let pageLang: string | null = null;
  try {
    const page = await fetchArticle(item.url, SOURCE_TIMEOUT_MS);
    // Trop court pour un article : la page est peut-être rendue par script — le fournisseur essaiera de la lire lui-même.
    if (page.text.length >= 300) {
      text = page.text;
      pageDate = page.publishedAt;
      pageLang = page.lang;
    }
  } catch {
    text = undefined;
  }

  try {
    const result = await provider.summarizeArticle({ url: item.url, title: item.title, publisher: item.publisher, text, topics: topicLabels });
    if (!result.readable || !result.summary) {
      await saveSummaryResult(item.id, { summaryState: "failed", summary: null, summaryModel: result.model, themes: [], angle: null });
      return false;
    }
    const copied = findCopiedPassage(result.summary, result.originalText);
    if (copied) {
      // Une reprise de douze mots : le résumé est refusé et n'est pas stocké — l'article reste « sans résumé ».
      await saveSummaryResult(item.id, { summaryState: "refused", summary: null, summaryModel: result.model, themes: result.themes, angle: result.angle });
      return false;
    }
    await saveSummaryResult(item.id, {
      summaryState: "done",
      summary: result.summary,
      summaryModel: result.model,
      themes: result.themes,
      angle: result.angle,
      lang: item.lang ?? result.lang ?? pageLang,
      publishedAt: item.publishedAt ?? dateFromIso(result.publishedAt) ?? pageDate,
      topicId: item.topicId ?? topicIdForThemes(result.themes, topics),
    });
    return true;
  } catch (error) {
    await saveSummaryResult(item.id, { summaryState: "failed", summary: null, summaryModel: null, themes: [], angle: readableError(error, tw) });
    return false;
  }
}

// ---------------------------------------------------------------------------
// La collecte elle-même
// ---------------------------------------------------------------------------

export async function executeWatchRun(run: WatchRun): Promise<WatchRunReport> {
  const started = Date.now();
  const deadline = started + WATCH_RUN_BUDGET_MS;
  const remaining = () => deadline - Date.now();
  const report: WatchRunReport = { sourcesOk: 0, sourcesFailed: 0, itemsNew: 0, itemsSummarized: 0, searches: 0, indicatorsRead: 0, error: null };
  const organizationId = run.organizationId;
  // Ce qui s'écrit pendant la collecte (cause d'un échec, angle d'un résumé manqué) l'est dans la langue de l'organisation.
  const tw = await translatorFor(await localeOfOrganization(organizationId), "watch");

  try {
    report.indicatorsRead = await refreshOrganizationIndicators(organizationId).catch(() => 0);

    const [topics, sources] = await Promise.all([listWatchTopics(organizationId), listWatchSources(organizationId)]);

    const dueFeeds = sources.filter((s) => s.feedUrl && isSourceDue(s));
    const feedResults = await inPool(dueFeeds, FEED_CONCURRENCY, (source) => collectFeed(source, tw));
    for (const r of feedResults) {
      if (r.ok) report.sourcesOk++;
      else report.sourcesFailed++;
      report.itemsNew += r.itemsNew;
    }

    let provider: AIProvider | null = null;
    try {
      provider = getAIProvider();
    } catch (error) {
      if (error instanceof AINotConfiguredError) report.error = "Recherches et résumés impossibles : le fournisseur IA n'est pas configuré.";
      else throw error;
    }

    if (provider) {
      const jobs = searchJobs(topics, sources);
      for (const job of jobs.slice(0, MAX_SEARCHES_PER_RUN)) {
        if (remaining() < SEARCH_RESERVE_MS) break;
        try {
          const r = await runSearch(provider, organizationId, job);
          report.itemsNew += r.itemsNew;
          report.searches += r.searches;
          if (job.source) await recordSourceSuccess(job.source.id);
          else await markTopicSearched(job.topic.id);
        } catch (error) {
          if (job.source) await recordSourceFailure(job.source, readableError(error, tw));
          else report.error = `Recherche « ${job.topic.label} » : ${readableError(error, tw)}`;
        }
      }

      const pending = await listPendingSummaries(organizationId, MAX_SUMMARIES_PER_RUN);
      for (const item of pending) {
        if (remaining() < SUMMARY_RESERVE_MS) break;
        if (await summarizeOne(provider, item, topics, tw)) report.itemsSummarized++;
      }
    }
  } catch (error) {
    report.error = readableError(error, tw);
  } finally {
    await finishWatchRun(run.id, report).catch(() => undefined);
  }
  return report;
}

/** Démarre et exécute tout de suite (le cron). */
export async function refreshWatchNow(organizationId: string, trigger: "visit" | "manual" | "cron"): Promise<StartRunResult & { report?: WatchRunReport }> {
  const start = await startWatchRun(organizationId, trigger);
  if (start.status !== "started") return start;
  const report = await executeWatchRun(start.run);
  return { ...start, report };
}

/** Les indicateurs du pack suivis d'un coup (écran des chiffres) — idempotent. */
export async function followPackIndicators(organizationId: string, keys: readonly string[]): Promise<number> {
  return followIndicators(organizationId, keys);
}
