import { displayScreen, type DisplayScreen } from "./screens";

/**
 * L'ÉTAT D'AFFICHAGE D'UN ÉCRAN — les paramètres d'adresse retenus, rien
 * d'autre. Ce module est PUR (aucune base, aucun React) : il sert au même
 * endroit côté serveur, côté client et dans les tests.
 */
export type ScreenState = Record<string, string>;

/** Un paramètre plus long que ça n'est pas un choix d'affichage — c'est une injection ou un accident. */
const MAX_VALUE = 200;
/** Assez pour les dix-huit paramètres des affaires, pas assez pour servir d'entrepôt. */
const MAX_ENTRIES = 24;

/**
 * Le filtre « c'est moi » : une vue partagée dit « mes contacts » pour
 * CHAQUE personne qui l'ouvre — l'identifiant du conseiller n'est donc
 * jamais figé dans la vue, il est résolu à la lecture. C'est aussi ce qui
 * évite qu'une vue partagée fasse fuiter un identifiant d'utilisateur.
 */
export const ME = "moi";

/**
 * Le paramètre qui désigne une VUE ENREGISTRÉE dans l'adresse (`?v=<id>`,
 * comme Notion). Court, parce qu'il voyage avec tout le reste ; et
 * surtout PAS « vue », déjà pris par la liste des affaires
 * (`?vue=liste|kanban`) depuis le module analytique. Il est mémorisé avec
 * l'état d'un écran — revenir par la navigation rouvre la vue — mais il
 * n'entre JAMAIS dans la définition d'une vue : une vue ne se contient pas
 * elle-même.
 */
export const VIEW_PARAM = "v";

/**
 * Ne garde que les paramètres déclarés par l'écran, non vides et de taille
 * raisonnable ; l'ordre est celui de la déclaration, pour que deux états
 * identiques produisent la MÊME adresse (une clé de cache, un lien
 * comparable, une preuve reproductible).
 */
export function sanitizeScreenState(screen: DisplayScreen | string | undefined, raw: Record<string, string | string[] | undefined>): ScreenState {
  const target = typeof screen === "string" ? displayScreen(screen) : screen;
  if (!target) return {};
  const state: ScreenState = {};
  for (const name of target.params) {
    const value = raw[name];
    const single = Array.isArray(value) ? value[0] : value;
    if (typeof single !== "string") continue;
    const trimmed = single.trim();
    if (!trimmed || trimmed.length > MAX_VALUE) continue;
    state[name] = trimmed;
    if (Object.keys(state).length >= MAX_ENTRIES) break;
  }
  return state;
}

/** La valeur lue en base : un objet de chaînes, ou rien si la ligne a été écrite autrement. */
export function parseScreenState(screen: DisplayScreen | string | undefined, value: unknown): ScreenState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) if (typeof entry === "string") raw[key] = entry;
  return sanitizeScreenState(screen, raw);
}

/** `?a=1&b=2`, ou la chaîne vide — jamais un « ? » seul. */
export function queryString(state: ScreenState): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(state)) if (value) sp.set(key, value);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Le lien d'un écran dans l'état mémorisé (la navigation) : le chemin nu quand il n'y a rien à retenir. */
export function screenHref(screen: DisplayScreen, state: ScreenState): string {
  return `${screen.href}${queryString(state)}`;
}

/** Le même état, un paramètre changé (`undefined` = le retirer) — pour les liens de tri, de page, de filtre. */
export function withParams(state: ScreenState, changes: Record<string, string | undefined>): ScreenState {
  const next: ScreenState = { ...state };
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === "") delete next[key];
    else next[key] = value;
  }
  return next;
}

/** Deux états sont-ils le même affichage ? (pour ne réécrire la mémoire que quand elle change). */
export function sameScreenState(a: ScreenState, b: ScreenState): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => a[key] === b[key]);
}

/**
 * Le filtre conseiller tel que la base le veut : `moi` devient
 * l'identifiant de la personne qui regarde, tout le reste passe par la
 * validation d'UUID des écrans. Une personne qui n'a pas de compte
 * (impossible ici) ou un `moi` sur un écran sans conseiller ne filtre rien.
 */
export function resolveOwnerFilter(value: string | undefined, viewerId: string): string | undefined {
  if (!value) return undefined;
  return value === ME ? viewerId : value;
}

/** Les densités proposées — « confortable » est la densité historique du produit. */
export const DENSITIES = ["confortable", "compacte"] as const;
export type Density = (typeof DENSITIES)[number];
export const DEFAULT_DENSITY: Density = "confortable";

export function parseDensity(value: unknown): Density | undefined {
  return typeof value === "string" && (DENSITIES as readonly string[]).includes(value) ? (value as Density) : undefined;
}
