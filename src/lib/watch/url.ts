import { createHash } from "node:crypto";

/**
 * L'URL CANONIQUE d'un article — la clé du dédoublonnage (« un même article
 * vu par deux sources compte une fois », docs/module-ciblage-contenu.md
 * §1.1) : hôte en minuscules, sans identifiants, sans fragment, sans les
 * paramètres de suivi (utm_*, fbclid, xtor…), paramètres restants triés,
 * port par défaut et barre finale retirés. Tout ce qui ne change pas la
 * page est effacé ; tout ce qui pourrait la changer (un `?page=2`, un
 * `?id=`) est gardé. Jamais une résolution réseau : deux URL différentes
 * qui mènent au même article par redirection restent deux articles — c'est
 * le prix d'une clé calculable sans appel.
 */
const TRACKING_PARAM =
  /^(utm_.*|fbclid|gclid|dclid|yclid|msclkid|mc_cid|mc_eid|_hsenc|_hsmi|igshid|xtor|at_medium|at_campaign|at_custom\d*|ref|ref_src|spm|mkt_tok|s_kwcid|wt_mc|pk_campaign|pk_kwd|piwik_campaign|piwik_kwd)$/i;

export function canonicalUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";
  url.username = "";
  url.password = "";
  if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) {
    url.port = "";
  }
  const kept = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (!TRACKING_PARAM.test(key)) kept.append(key, value);
  }
  kept.sort();
  const query = kept.toString();
  url.search = query ? `?${query}` : "";
  let path = url.pathname.replace(/\/{2,}/g, "/");
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  url.pathname = path;
  return url.toString();
}

/** L'empreinte stockée à côté de l'URL canonique — unique par organisation (`watch_items_org_url_unique`). */
export function urlHash(canonical: string): string {
  return createHash("sha256").update(canonical).digest("hex");
}

/** « lesechos.fr » pour https://www.lesechos.fr/… — l'éditeur par défaut d'un résultat de recherche, et le domaine d'une restriction. */
export function hostOf(raw: string): string | null {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Le pays d'un éditeur déduit de son domaine national — et seulement de
 * lui : un `.com` ne dit rien, on rend null plutôt qu'une supposition (le
 * pays s'affiche avec chaque article, un pays faux serait pire qu'un pays
 * inconnu). Les codes sont ISO 3166-1 alpha-2, le Royaume-Uni est « GB ».
 */
const CCTLD_COUNTRY: Record<string, string> = {
  fr: "FR",
  be: "BE",
  ch: "CH",
  lu: "LU",
  de: "DE",
  es: "ES",
  it: "IT",
  nl: "NL",
  pt: "PT",
  ie: "IE",
  at: "AT",
  uk: "GB",
  ca: "CA",
  us: "US",
  au: "AU",
  ma: "MA",
  eu: "EU",
};

export function countryFromHost(host: string | null): string | null {
  if (!host) return null;
  const tld = host.split(".").pop() ?? "";
  return CCTLD_COUNTRY[tld] ?? null;
}
