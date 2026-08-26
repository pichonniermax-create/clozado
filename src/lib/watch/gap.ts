import type { Messages } from "@/i18n/messages";

/**
 * L'ÉCART DE CONTENU — le produit de la veille concurrentielle (cahier
 * « ciblage et contenu », partie 2, point 2) : « trois de tes concurrents
 * ont traité le rachat de crédit ce mois-ci, tu ne l'as pas fait ». Des
 * fonctions PURES, calculées à la lecture depuis ce qui est déjà en base :
 * les articles des concurrents (titre, lien, date, sujet et angle classés
 * depuis le TITRE — jamais le texte, voir refresh.ts) d'un côté, ce que
 * l'organisation a traité de l'autre (les sujets déclarés de ses
 * newsletters marquées envoyées, les thèmes des articles qu'elle y a
 * rattachés). Rien n'est généré : chaque ligne de l'écart se lit dans les
 * articles qui la composent, et se vérifie.
 */

/** Les angles qu'un concurrent peut prendre — un registre FERMÉ, donc traduisible (`watch.angles.<clé>`). */
export const COMPETITOR_ANGLES = ["guide", "news", "figures", "alert", "comparison", "opinion", "promotion", "testimonial", "other"] as const satisfies readonly (keyof Messages["watch"]["angles"])[];
export type CompetitorAngle = (typeof COMPETITOR_ANGLES)[number];

export function isCompetitorAngle(value: unknown): value is CompetitorAngle {
  return typeof value === "string" && (COMPETITOR_ANGLES as readonly string[]).includes(value);
}

/** « Ce mois-ci » : trente jours glissants — une newsletter est hebdomadaire ou mensuelle, l'écart se lit à cette échelle. */
export const GAP_WINDOW_DAYS = 30;

/** Un article publié par un concurrent, tel que l'écart le lit — ce qui est en base, rien de plus. */
export type CompetitorArticle = {
  id: string;
  title: string;
  url: string;
  publishedAt: Date | null;
  discoveredAt: Date;
  sourceId: string;
  sourceLabel: string;
  /** Le sujet classé depuis le titre (`themes[0]`), null tant qu'il ne l'est pas ou si le titre n'annonce pas un article. */
  subject: string | null;
  /** L'angle classé (clé de `COMPETITOR_ANGLES`), null sinon. */
  angle: string | null;
  /** Classé (la collecte a lu le titre) — un article non classé compte dans la fréquence, pas dans l'écart. */
  classified: boolean;
  /** Pas encore classé (à la prochaine collecte) — par opposition à un titre qui n'annonce pas un article. */
  pending: boolean;
};

/** Un sujet que l'organisation a traité : d'où ça vient, pour le dire (« traité dans « Taux d'août » le 12 août »). */
export type TreatedSubject = {
  subject: string;
  newsletterId: string;
  newsletterTitle: string;
  /** Null : un brouillon — « en préparation », pas encore traité. */
  sentAt: Date | null;
};

export type GapCompetitor = { id: string; label: string; articles: number };

export type GapRow = {
  /** Le sujet normalisé — la clé du groupe. */
  key: string;
  /** Le libellé à afficher : la forme la plus fréquente parmi les articles. */
  subject: string;
  competitors: GapCompetitor[];
  articles: CompetitorArticle[];
  angles: { angle: CompetitorAngle; count: number }[];
  latestAt: Date | null;
  /** Les newsletters ENVOYÉES qui traitent ce sujet — vide, c'est l'écart. */
  sent: TreatedSubject[];
  /** Les brouillons qui le traitent — « en préparation ». */
  drafts: TreatedSubject[];
};

export type ContentGap = {
  /** Traité par au moins un concurrent, par aucune newsletter envoyée — le plus de concurrents d'abord. */
  gaps: GapRow[];
  /** Traité des deux côtés. */
  covered: GapRow[];
  since: Date;
  days: number;
};

/** Des mots vides, ignorés pour comparer deux sujets — pas un texte d'interface. */
const STOP_WORDS = new Set(["le", "la", "les", "l", "de", "des", "du", "d", "un", "une", "et", "en", "au", "aux", "a", "sur", "pour", "avec", "the", "of", "and", "an", "in", "for", "to", "on", "with", "your"]);

/**
 * Deux sujets écrits différemment mais pareils — « Rachat de crédits »,
 * « rachat de crédit », « Le rachat de crédit » — donnent la même clé :
 * minuscules, sans accents ni ponctuation, sans mots vides, un pluriel
 * simple retiré des mots d'au moins quatre lettres. Assez pour grouper ce
 * qu'un même modèle écrit à peu près pareil, pas une lemmatisation.
 */
export function normalizeSubject(subject: string): string {
  return subject
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word && !STOP_WORDS.has(word))
    .map((word) => (word.length >= 4 ? word.replace(/(aux|eaux)$/, "au").replace(/[sx]$/, "") : word))
    .join(" ");
}

/**
 * Le sujet d'un concurrent et un sujet traité par l'organisation parlent
 * de la même chose : mêmes clés, ou l'une contient l'autre mot à mot
 * (« crédit immobilier » ⊂ « taux crédit immobilier ») — à condition que
 * la plus courte fasse au moins deux mots ou huit lettres, pour qu'un mot
 * seul (« taux ») n'absorbe pas tout.
 */
export function subjectsMatch(a: string, b: string): boolean {
  const na = normalizeSubject(a);
  const nb = normalizeSubject(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const [short, long] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (short.split(" ").length < 2 && short.length < 8) return false;
  return ` ${long} `.includes(` ${short} `);
}

/** La date qui situe un article : celle de publication, sinon celle de sa découverte (jamais une date plausible). */
export function dateOf(article: Pick<CompetitorArticle, "publishedAt" | "discoveredAt">): Date {
  return article.publishedAt ?? article.discoveredAt;
}

function byDateDesc(a: CompetitorArticle, b: CompetitorArticle): number {
  return dateOf(b).getTime() - dateOf(a).getTime();
}

function displayLabel(labels: string[]): string {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return [...counts.entries()].sort((x, y) => y[1] - x[1] || x[0].length - y[0].length || x[0].localeCompare(y[0]))[0][0];
}

function angleCounts(articles: CompetitorArticle[]): { angle: CompetitorAngle; count: number }[] {
  const counts = new Map<CompetitorAngle, number>();
  for (const article of articles) {
    if (isCompetitorAngle(article.angle)) counts.set(article.angle, (counts.get(article.angle) ?? 0) + 1);
  }
  return [...counts.entries()].map(([angle, count]) => ({ angle, count })).sort((a, b) => b.count - a.count);
}

function rowOrder(a: GapRow, b: GapRow): number {
  return (
    b.competitors.length - a.competitors.length ||
    b.articles.length - a.articles.length ||
    (b.latestAt?.getTime() ?? 0) - (a.latestAt?.getTime() ?? 0) ||
    a.subject.localeCompare(b.subject)
  );
}

/**
 * L'écart lui-même. Les articles classés de la fenêtre, groupés par sujet
 * normalisé ; chaque groupe compte ses concurrents distincts, ses angles,
 * sa date la plus récente ; puis ce que l'organisation a traité s'y
 * rapporte (`subjectsMatch`) : une newsletter envoyée retire le sujet de
 * l'écart, un brouillon le laisse — en préparation.
 */
export function computeContentGap(
  articles: CompetitorArticle[],
  treated: TreatedSubject[],
  opts: { now?: Date; days?: number } = {}
): ContentGap {
  const now = opts.now ?? new Date();
  const days = opts.days ?? GAP_WINDOW_DAYS;
  const since = new Date(now.getTime() - days * 24 * 3600 * 1000);
  const groups = new Map<string, CompetitorArticle[]>();
  for (const article of articles) {
    if (!article.classified || !article.subject || dateOf(article).getTime() < since.getTime()) continue;
    const key = normalizeSubject(article.subject);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), article]);
  }
  const rows: GapRow[] = [];
  for (const [key, group] of groups) {
    const sorted = [...group].sort(byDateDesc);
    const perCompetitor = new Map<string, GapCompetitor>();
    for (const article of sorted) {
      const entry = perCompetitor.get(article.sourceId) ?? { id: article.sourceId, label: article.sourceLabel, articles: 0 };
      entry.articles++;
      perCompetitor.set(article.sourceId, entry);
    }
    const matching = treated.filter((t) => subjectsMatch(key, t.subject));
    rows.push({
      key,
      subject: displayLabel(sorted.map((a) => a.subject as string)),
      competitors: [...perCompetitor.values()].sort((a, b) => b.articles - a.articles || a.label.localeCompare(b.label)),
      articles: sorted,
      angles: angleCounts(sorted),
      latestAt: sorted.length ? dateOf(sorted[0]) : null,
      sent: matching.filter((t) => t.sentAt),
      drafts: matching.filter((t) => !t.sentAt),
    });
  }
  rows.sort(rowOrder);
  return { gaps: rows.filter((r) => r.sent.length === 0), covered: rows.filter((r) => r.sent.length > 0), since, days };
}

export type CompetitorStats = {
  id: string;
  label: string;
  /** Articles dans la fenêtre (trente jours). */
  inWindow: number;
  /** ≈ par semaine, sur la fenêtre. */
  perWeek: number;
  /** Tout ce qu'on connaît d'eux (soixante jours de collecte). */
  total: number;
  lastAt: Date | null;
  topSubjects: { subject: string; count: number }[];
  topAngle: CompetitorAngle | null;
  /** Dans la fenêtre, pas encore classés (à la prochaine collecte). */
  unclassified: number;
};

/** « Ce qu'ils publient » par concurrent : fréquence, dernier article, sujets et angle dominants — depuis les mêmes articles que l'écart. */
export function competitorStats(
  competitors: { id: string; label: string }[],
  articles: CompetitorArticle[],
  opts: { now?: Date; days?: number } = {}
): CompetitorStats[] {
  const now = opts.now ?? new Date();
  const days = opts.days ?? GAP_WINDOW_DAYS;
  const since = now.getTime() - days * 24 * 3600 * 1000;
  return competitors.map((competitor) => {
    const own = articles.filter((a) => a.sourceId === competitor.id).sort(byDateDesc);
    const recent = own.filter((a) => dateOf(a).getTime() >= since);
    const subjects = new Map<string, { subject: string; count: number; labels: string[] }>();
    for (const article of recent) {
      if (!article.classified || !article.subject) continue;
      const key = normalizeSubject(article.subject);
      if (!key) continue;
      const entry = subjects.get(key) ?? { subject: article.subject, count: 0, labels: [] };
      entry.count++;
      entry.labels.push(article.subject);
      subjects.set(key, entry);
    }
    const topSubjects = [...subjects.values()]
      .map((s) => ({ subject: displayLabel(s.labels), count: s.count }))
      .sort((a, b) => b.count - a.count || a.subject.localeCompare(b.subject))
      .slice(0, 3);
    const angles = angleCounts(recent);
    return {
      id: competitor.id,
      label: competitor.label,
      inWindow: recent.length,
      perWeek: Math.round((recent.length * 7 * 10) / days) / 10,
      total: own.length,
      lastAt: own.length ? dateOf(own[0]) : null,
      topSubjects,
      topAngle: angles[0]?.angle ?? null,
      unclassified: recent.filter((a) => !a.classified).length,
    };
  });
}
