import { SITE_CONFIG } from "./site-config";
import type { Locale } from "./i18n";

/**
 * LES PAGES DU SITE, en données. Une page = une clé ; son libellé vit dans
 * les contenus (`common.nav`), jamais ici.
 *
 * `built` dit si la page EXISTE déjà. Une page non construite n'est ni
 * liée, ni déclarée au sitemap : le site n'a jamais de lien mort, et les
 * pages s'ouvrent au fil des étapes en basculant un booléen.
 *
 * DEUX NIVEAUX depuis le 2026-09-18 : `menu` donne l'ordre dans la barre,
 * `parent` fait descendre une page dans le déroulant d'une autre. Les trois
 * pages métier sont ainsi passées sous « Produit », qui devient la page
 * centrale du site. La page Tarifs a été retirée : la tarification se donne
 * en démonstration, et `/tarifs` redirige (voir `vercel.json`).
 */
export type RouteKey =
  | "accueil"
  | "produit"
  | "cgp"
  | "courtiers"
  | "immobilier"
  | "conformite"
  | "demo"
  | "blog"
  | "aPropos"
  | "carrieres"
  | "mentionsLegales"
  | "confidentialite";

type Route = {
  /** Le segment d'adresse, après la langue. Vide pour l'accueil. */
  segment: string;
  built: boolean;
  /** Son rang dans la barre de navigation ; absente de la barre si `undefined`. */
  menu?: number;
  /** Sa page parente : elle apparaît alors dans le déroulant de celle-ci. */
  parent?: RouteKey;
  /** Son groupe au pied de page. */
  pied?: "produit" | "societe" | "legal";
  /** Sa priorité au sitemap. */
  priority: number;
};

export const ROUTES: Record<RouteKey, Route> = {
  accueil: { segment: "", built: true, priority: 1 },
  produit: { segment: "produit", built: true, menu: 1, pied: "produit", priority: 0.9 },
  cgp: { segment: "cgp", built: true, parent: "produit", pied: "produit", priority: 0.8 },
  courtiers: { segment: "courtiers", built: true, parent: "produit", pied: "produit", priority: 0.8 },
  immobilier: { segment: "immobilier", built: true, parent: "produit", pied: "produit", priority: 0.8 },
  conformite: { segment: "conformite", built: true, menu: 2, pied: "produit", priority: 0.8 },
  demo: { segment: "demo", built: true, menu: 3, pied: "produit", priority: 0.8 },
  blog: { segment: "blog", built: true, menu: 4, pied: "societe", priority: 0.5 },
  aPropos: { segment: "a-propos", built: true, menu: 5, pied: "societe", priority: 0.5 },
  carrieres: { segment: "carrieres", built: true, menu: 6, pied: "societe", priority: 0.4 },
  mentionsLegales: { segment: "mentions-legales", built: true, pied: "legal", priority: 0.2 },
  confidentialite: { segment: "confidentialite", built: true, pied: "legal", priority: 0.2 },
};

export const ROUTE_KEYS = Object.keys(ROUTES) as RouteKey[];

/** Le chemin d'une page, langue comprise : « /fr », « /fr/produit ». */
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

/** La barre de navigation : les pages de premier niveau, dans leur ordre. */
export function menuPrincipal(): RouteKey[] {
  return builtRoutes()
    .filter((key) => ROUTES[key].menu !== undefined)
    .sort((a, b) => (ROUTES[a].menu ?? 0) - (ROUTES[b].menu ?? 0));
}

/** Le déroulant d'une entrée : ses pages filles construites. */
export function sousEntrees(parent: RouteKey): RouteKey[] {
  return builtRoutes().filter((key) => ROUTES[key].parent === parent);
}

/** Un groupe du pied de page. */
export function groupeDuPied(groupe: NonNullable<Route["pied"]>): RouteKey[] {
  return builtRoutes().filter((key) => ROUTES[key].pied === groupe);
}
