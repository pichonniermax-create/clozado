import { XMLParser } from "fast-xml-parser";
import { WatchFetchError, fetchWithTimeout, readBodyText } from "./http";

/**
 * Les FLUX RSS/Atom — le chemin le moins cher et le plus fiable de la veille
 * (docs/module-ciblage-contenu.md §1.1). Ce qui sort d'un flux, c'est un
 * TITRE, un LIEN et une DATE : ni la description, ni le contenu, ni
 * l'extrait — ils ne sont pas lus, le type `FeedEntry` n'a pas de champ
 * pour eux. Un flux illisible, muet ou en erreur lève une `WatchFetchError`
 * avec une cause en français, que la source affiche telle quelle.
 */
export type FeedEntry = { title: string; url: string; publishedAt: Date | null };
export type ParsedFeed = { title: string | null; entries: FeedEntry[] };

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  parseTagValue: false,
  processEntities: true,
});

type Node = unknown;

function asArray(node: Node): Node[] {
  if (node === undefined || node === null) return [];
  return Array.isArray(node) ? node : [node];
}

function textOf(node: Node): string {
  if (node === undefined || node === null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return textOf(node[0]);
  if (typeof node === "object") {
    const text = (node as Record<string, unknown>)["#text"];
    return textOf(text);
  }
  return "";
}

function attrOf(node: Node, name: string): string {
  if (node && typeof node === "object" && !Array.isArray(node)) {
    const value = (node as Record<string, unknown>)[`@_${name}`];
    return typeof value === "string" ? value : "";
  }
  return "";
}

/** Les entités HTML qu'un titre de flux traîne encore après l'analyse XML (« &rsquo; », « &#8217; »…). */
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  laquo: "«",
  raquo: "»",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  eacute: "é",
  egrave: "è",
  agrave: "à",
  ccedil: "ç",
  ecirc: "ê",
  ocirc: "ô",
  ugrave: "ù",
  euro: "€",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

/** Un titre propre : entités décodées, balises retirées, espaces repliés. */
export function cleanTitle(raw: string): string {
  return decodeEntities(raw.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Les dates des flux : RFC 2822 (« Mon, 24 Aug 2026 08:00:00 +0200 »), ISO
 * 8601, ou la forme « 2026-08-25 16:43:06 » sans fuseau que servent
 * certains sites (lue comme heure de Paris). Illisible = null, jamais une
 * date plausible.
 */
export function parseFeedDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;
  const bare = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/.exec(text);
  if (bare) {
    const date = new Date(`${bare[1]}T${bare[2]}+02:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const date = new Date(`${text}T12:00:00+02:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  // Une date de flux dans le futur lointain est une coquille de l'éditeur, pas une publication.
  if (date.getTime() > Date.now() + 2 * 24 * 3600 * 1000) return null;
  return date;
}

function pushEntry(entries: FeedEntry[], title: string, link: string, date: string | null, base: string) {
  const cleaned = cleanTitle(title);
  const href = link.trim();
  if (!cleaned || !href) return;
  let absolute: string;
  try {
    absolute = new URL(href, base).toString();
  } catch {
    return;
  }
  entries.push({ title: cleaned, url: absolute, publishedAt: parseFeedDate(date) });
}

/** Le lien d'une entrée Atom : `rel="alternate"` (ou sans rel) d'abord, sinon le premier `href`. */
function atomLink(entry: Record<string, unknown>): string {
  const links = asArray(entry.link);
  const alternate = links.find((l) => {
    const rel = attrOf(l, "rel");
    return (!rel || rel === "alternate") && attrOf(l, "href");
  });
  return attrOf(alternate ?? links[0], "href") || textOf(entry.link);
}

/** Analyse un flux RSS 2.0, Atom ou RSS 1.0 (RDF). Lève `WatchFetchError("flux illisible")` sur tout ce qui n'en est pas un. */
export function parseFeed(xml: string, base: string): ParsedFeed {
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch {
    throw new WatchFetchError("flux illisible");
  }
  const entries: FeedEntry[] = [];

  const rss = doc.rss as Record<string, unknown> | undefined;
  const channel = rss ? (asArray(rss.channel)[0] as Record<string, unknown> | undefined) : undefined;
  if (channel) {
    for (const raw of asArray(channel.item)) {
      const item = raw as Record<string, unknown>;
      pushEntry(entries, textOf(item.title), textOf(item.link) || attrOf(item.link, "href"), textOf(item.pubDate) || textOf(item["dc:date"]) || null, base);
    }
    return { title: cleanTitle(textOf(channel.title)) || null, entries };
  }

  const feed = doc.feed as Record<string, unknown> | undefined;
  if (feed) {
    for (const raw of asArray(feed.entry)) {
      const entry = raw as Record<string, unknown>;
      pushEntry(entries, textOf(entry.title), atomLink(entry), textOf(entry.published) || textOf(entry.updated) || null, base);
    }
    return { title: cleanTitle(textOf(feed.title)) || null, entries };
  }

  const rdf = (doc["rdf:RDF"] ?? doc.RDF) as Record<string, unknown> | undefined;
  if (rdf) {
    const channelNode = asArray(rdf.channel)[0] as Record<string, unknown> | undefined;
    for (const raw of asArray(rdf.item)) {
      const item = raw as Record<string, unknown>;
      pushEntry(entries, textOf(item.title), textOf(item.link) || attrOf(item, "rdf:about"), textOf(item["dc:date"]) || null, base);
    }
    return { title: cleanTitle(textOf(channelNode?.title)) || null, entries };
  }

  throw new WatchFetchError("flux illisible");
}

const FEED_ACCEPT = "application/rss+xml, application/atom+xml, application/rdf+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5";

/** Lit un flux déclaré. Erreurs lisibles : « délai dépassé (10 s) », « réponse 404 », « flux illisible ». */
export async function fetchFeed(feedUrl: string, timeoutMs: number): Promise<ParsedFeed> {
  const response = await fetchWithTimeout(feedUrl, timeoutMs, FEED_ACCEPT);
  const xml = await readBodyText(response, 2_000_000);
  if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(xml.slice(0, 4000))) {
    throw new WatchFetchError("flux illisible (la page n'est pas un flux)");
  }
  return parseFeed(xml, feedUrl);
}

const COMMON_FEED_PATHS = ["/feed/", "/feed", "/rss", "/rss.xml", "/feed.xml", "/atom.xml", "/index.xml", "/?feed=rss2", "/fr/rss"];

/**
 * Découvre le flux d'un site depuis sa page d'accueil (`<link rel="alternate"
 * type="application/rss+xml">` — le cas courant des sites WordPress des
 * cabinets), puis en essayant les chemins usuels. Rend null quand il n'y en
 * a pas : la source vit alors par la recherche restreinte à son domaine.
 */
export async function discoverFeed(siteUrl: string, timeoutMs: number): Promise<{ feedUrl: string; title: string | null } | null> {
  let html = "";
  try {
    const response = await fetchWithTimeout(siteUrl, timeoutMs, "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
    html = await readBodyText(response, 1_500_000);
  } catch {
    html = "";
  }
  const candidates: string[] = [];
  const linkTags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of linkTags) {
    if (!/rel\s*=\s*["']?alternate["']?/i.test(tag)) continue;
    if (!/type\s*=\s*["']?application\/(rss|atom|rdf)\+xml/i.test(tag)) continue;
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (href) candidates.push(href);
  }
  // Un flux déclaré dans la page passe avant les chemins devinés ; les
  // commentaires WordPress (« /comments/feed/ ») sont écartés.
  for (const href of candidates) {
    if (/comments?\/feed/i.test(href)) continue;
    const feed = await tryFeed(href, siteUrl, timeoutMs);
    if (feed) return feed;
  }
  for (const path of COMMON_FEED_PATHS) {
    const feed = await tryFeed(path, siteUrl, timeoutMs);
    if (feed) return feed;
  }
  return null;
}

async function tryFeed(href: string, base: string, timeoutMs: number): Promise<{ feedUrl: string; title: string | null } | null> {
  let url: string;
  try {
    url = new URL(href, base).toString();
  } catch {
    return null;
  }
  try {
    const parsed = await fetchFeed(url, timeoutMs);
    return parsed.entries.length > 0 ? { feedUrl: url, title: parsed.title } : null;
  } catch {
    return null;
  }
}
