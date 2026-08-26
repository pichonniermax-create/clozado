import { decodeEntities } from "./feeds";
import { WatchFetchError, fetchWithTimeout, readBodyText } from "./http";

/**
 * La LECTURE d'un article au moment du résumé — et rien d'autre : le texte
 * rendu ici vit le temps de l'appel au modèle et du contrôle d'originalité,
 * puis disparaît. Aucune fonction de ce module n'écrit en base, aucune ne
 * rend plus que ce qu'il faut pour résumer (30 000 caractères au plus).
 *
 * Extraction sans dépendance : les scripts, styles, menus, en-têtes,
 * pieds de page et formulaires sont retirés ; le corps est pris dans
 * `<article>` (le plus long s'il y en a plusieurs), sinon `<main>`, sinon
 * `<body>`. Quand le résultat est trop court pour être un article, on
 * retombe sur le corps entier — un menu seul ne fait pas un article, et le
 * modèle le dira (`readable = false`).
 */
export const MAX_ARTICLE_CHARS = 30_000;

export type ArticleText = {
  text: string;
  title: string | null;
  /** La date de publication déclarée par la page elle-même (balises meta), sinon null. */
  publishedAt: Date | null;
  lang: string | null;
};

const DROP_WHOLE = /<(script|style|noscript|svg|template|iframe|canvas|video|audio|object)\b[\s\S]*?<\/\1\s*>/gi;
const DROP_CHROME = /<(nav|header|footer|aside|form|button|select|dialog|menu)\b[\s\S]*?<\/\1\s*>/gi;
const BLOCK_TAG = /<\/?(p|div|br|li|ul|ol|h[1-6]|section|article|main|blockquote|tr|td|th|table|figure|figcaption|pre|dd|dt|dl|hr)\b[^>]*>/gi;

function metaContent(html: string, matcher: RegExp): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    if (!matcher.test(tag)) continue;
    const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (content) return decodeEntities(content).trim();
  }
  return null;
}

function largest(matches: RegExpMatchArray[] | null): string | null {
  if (!matches || matches.length === 0) return null;
  return matches.map((m) => m[0]).sort((a, b) => b.length - a.length)[0];
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(DROP_WHOLE, " ")
      .replace(BLOCK_TAG, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Extrait le texte de l'article d'une page HTML, avec le titre, la date et la langue que la page déclare. */
export function extractArticle(html: string): ArticleText {
  const title = metaContent(html, /property\s*=\s*["']og:title["']/i) ?? decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").trim() ?? null;
  const dateRaw =
    metaContent(html, /property\s*=\s*["']article:published_time["']/i) ??
    metaContent(html, /(name|itemprop)\s*=\s*["'](datePublished|date|dc\.date|dcterms\.created|publish-date|pubdate)["']/i) ??
    /<time\b[^>]*datetime\s*=\s*["']([^"']+)["']/i.exec(html)?.[1] ??
    null;
  let publishedAt: Date | null = null;
  if (dateRaw) {
    const date = new Date(dateRaw);
    publishedAt = Number.isNaN(date.getTime()) ? null : date;
  }
  const lang = /<html\b[^>]*\blang\s*=\s*["']([a-zA-Z]{2})/i.exec(html)?.[1]?.toLowerCase() ?? null;

  const stripped = html.replace(/<!--[\s\S]*?-->/g, " ").replace(DROP_WHOLE, " ");
  const article = largest(Array.from(stripped.matchAll(/<article\b[\s\S]*?<\/article\s*>/gi)));
  const main = /<main\b[\s\S]*?<\/main\s*>/i.exec(stripped)?.[0] ?? null;
  const body = /<body\b[\s\S]*?<\/body\s*>/i.exec(stripped)?.[0] ?? stripped;

  let text = "";
  for (const container of [article, main, body]) {
    if (!container) continue;
    text = htmlToText(container.replace(DROP_CHROME, " "));
    if (text.length >= 400) break;
  }
  if (text.length < 400) text = htmlToText(body);
  return { text: text.slice(0, MAX_ARTICLE_CHARS), title: title || null, publishedAt, lang };
}

/** Lit la page d'un article (10 s, 1,5 Mo au plus). Une page qui n'est pas du HTML (PDF…) n'est pas lue : le fournisseur IA prend le relais. */
export async function fetchArticle(url: string, timeoutMs: number): Promise<ArticleText> {
  const response = await fetchWithTimeout(url, timeoutMs, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5");
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !/text\/html|application\/xhtml/i.test(contentType)) {
    throw new WatchFetchError(`contenu non lisible (${contentType.split(";")[0].trim()})`);
  }
  const html = await readBodyText(response, 1_500_000);
  return extractArticle(html);
}
