import { SITE_CONFIG } from "./site-config";
import type { Locale } from "./i18n";

/**
 * LES PAGES DU SITE, en données. Une page = une clé ; son libellé vit dans
 * les contenus (`common.nav`), jamais ici.
 *
 * `built` dit si la page EXISTE déjà. Une page non construite n'est ni
 * liée, ni déclarée au sitemap : le site n'a jamais de lien mort, et les
 * pages s'ouvrent au fil des étapes en basculant un booléen.
 */
export type RouteKey =
  | "accueil"
  | "cgp"
  | "courtiers"
  | "immobilier"
  | "tarifs"
  | "demo"
  | "mentionsLegales"
  | "confidentialite";

type Route = {
  /** Le segment d'adresse, après la langue. Vide pour l'accueil. */
  segment: string;
  built: boolean;
  /** Sa place dans la navigation principale ; absente du menu si `undefined`. */
  navGroup?: "metiers" | "produit";
  /** Sa priorité au sitemap. */
  priority: number;
};

export const ROUTES: Record<RouteKey, Route> = {
  accueil: { segment: "", built: true, priority: 1 },
  cgp: { segment: "cgp", built: false, navGroup: "metiers", priority: 0.9 },
  courtiers: { segment: "courtiers", built: false, navGroup: "metiers", priority: 0.9 },
  immobilier: { segment: "immobilier", built: false, navGroup: "metiers", priority: 0.9 },
  tarifs: { segment: "tarifs", built: false, navGroup: "produit", priority: 0.8 },
  demo: { segment: "demo", built: false, navGroup: "produit", priority: 0.8 },
  mentionsLegales: { segment: "mentions-legales", built: false, priority: 0.2 },
  confidentialite: { segment: "confidentialite", built: false, priority: 0.2 },
};

export const ROUTE_KEYS = Object.keys(ROUTES) as RouteKey[];

/** Le chemin d'une page, langue comprise : « /fr », « /fr/cgp ». */
export function path(locale: Locale, key: RouteKey): string {
  const { segment } = ROUTES[key];
  return segment ? `/${locale}/${segment}` : `/${locale}`;
}

/** Son adresse absolue sur le domaine canonique — pour les canoniques, le sitemap et les données structurées. */
export function url(locale: Locale, key: RouteKey): string {
  return `${SITE_CONFIG.origin}${path(locale, key)}`;
}

/** Les pages construites, dans l'ordre de déclaration. */
export function builtRoutes(): RouteKey[] {
  return ROUTE_KEYS.filter((key) => ROUTES[key].built);
}

/** Les entrées d'un groupe de navigation, construites seulement. */
export function navRoutes(group: Route["navGroup"]): RouteKey[] {
  return ROUTE_KEYS.filter((key) => ROUTES[key].built && ROUTES[key].navGroup === group);
}
