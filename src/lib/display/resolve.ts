import { getPreferences, PREF, preferenceList, preferenceString, type Preferences } from "@/db/queries/preferences";
import { listViews, type ListedView } from "@/db/queries/saved-views";
import type { SessionUser } from "@/lib/session";
import { DISPLAY_SCREENS, type DisplayScreen } from "./screens";
import { isBuiltInViewId } from "./built-in-views";
import { parseDensity, parseScreenState, queryString, sanitizeScreenState, VIEW_PARAM, type Density, type ScreenState } from "./state";

/**
 * CE QUE L'ÉCRAN DOIT AFFICHER (lot 1) — la seule fonction qui décide,
 * pour que deux listes ne s'accordent pas différemment :
 *
 * 1. `?v=<vue>` pose le cadrage de la vue ;
 * 2. les paramètres présents dans l'adresse l'emportent, un par un (on
 *    peut ouvrir une vue ET changer une colonne de tri sans la perdre) ;
 * 3. ce qui reste vient des défauts de l'écran.
 *
 * On rend aussi `modified` : la vue est ouverte mais l'affichage ne lui
 * correspond plus — c'est ce qui permet de proposer « Mettre à jour la
 * vue » sans jamais l'écrire dans le dos de la personne.
 */
export type ResolvedDisplay = {
  screen: DisplayScreen;
  /** Les paramètres effectifs, vue appliquée — la source unique de l'écran. */
  params: ScreenState;
  /** La vue ouverte, ou null. */
  view: ListedView | null;
  /** Toutes les vues proposées à cette personne sur cet écran (les masquées en moins). */
  views: ListedView[];
  /** L'affichage courant s'écarte de la vue ouverte. */
  modified: boolean;
  density: Density | undefined;
  preferences: Preferences;
};

export async function resolveDisplay(
  user: SessionUser,
  screen: DisplayScreen,
  raw: Record<string, string | string[] | undefined>
): Promise<ResolvedDisplay> {
  const [preferences, allViews] = await Promise.all([
    getPreferences(user),
    screen.view ? listViews(user, screen.view) : Promise.resolve([] as ListedView[]),
  ]);
  const hidden = new Set(preferenceList(preferences, PREF.hiddenViews) ?? []);
  // Une vue fournie masquée disparaît du menu ; une vue enregistrée, elle, se supprime — on ne la cache pas.
  const views = allViews.filter((v) => !(isBuiltInViewId(v.id) && hidden.has(v.id)));

  const urlState = sanitizeScreenState(screen, raw);
  const requested = urlState[VIEW_PARAM];
  const view = requested ? (allViews.find((v) => v.id === requested) ?? null) : null;
  const explicit: ScreenState = { ...urlState };
  delete explicit[VIEW_PARAM];

  const params: ScreenState = view ? { ...view.definition.params, ...explicit } : { ...explicit };
  if (view) params[VIEW_PARAM] = view.id;

  const modified = Boolean(
    view &&
      Object.entries({ ...view.definition.params, ...explicit }).some(
        ([key, value]) => (view.definition.params[key] ?? "") !== value && key !== VIEW_PARAM
      )
  );

  const density =
    parseDensity(explicit.densite) ?? (view ? view.definition.densite : undefined) ?? parseDensity(preferenceString(preferences, PREF.density));

  return { screen, params, view, views, modified, density, preferences };
}

/**
 * LES LIENS DE LA NAVIGATION — où mène chaque entrée du menu. Deux règles,
 * dans cet ordre (correction du 2026-09-18) :
 *
 * 1. la VUE PAR DÉFAUT du module, si la personne en a désigné une : elle
 *    s'ouvre à chaque arrivée, c'est tout le sens du réglage. Un choix
 *    durable et explicite passe avant un souvenir implicite ;
 * 2. sinon le DERNIER ÉTAT de l'écran (lot 1, étape 1) : ses filtres, son
 *    tri, sa page — revenir, c'est retrouver son travail ;
 * 3. sinon le chemin nu.
 *
 * `?v=<vue>` suffit pour la première règle : l'écran déplie la vue
 * lui-même, la coquille n'en charge aucune. Une seule lecture pour toute
 * la coquille (les préférences sont déjà mémoïsées).
 */
export async function navigationHrefs(user: SessionUser): Promise<Record<string, string>> {
  const preferences = await getPreferences(user);
  const hrefs: Record<string, string> = {};
  for (const screen of DISPLAY_SCREENS) {
    const byDefault = screen.view ? preferenceString(preferences, PREF.defaultView(screen.view)) : undefined;
    if (byDefault) {
      hrefs[screen.href] = `${screen.href}?${VIEW_PARAM}=${encodeURIComponent(byDefault)}`;
      continue;
    }
    const state = parseScreenState(screen, preferences.get(PREF.screen(screen.key)));
    if (Object.keys(state).length > 0) hrefs[screen.href] = `${screen.href}${queryString(state)}`;
  }
  return hrefs;
}
