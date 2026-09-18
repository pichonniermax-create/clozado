import type { SavedViewScreen } from "@/db/schema/user-preferences";

/**
 * LE REGISTRE DES ÉCRANS QUI SE SOUVIENNENT (lot 1, étape 1) — un écran
 * qui mémorise son affichage est déclaré ICI, avec la LISTE BLANCHE de ses
 * paramètres d'adresse. Rien d'autre n'est jamais écrit en base : ni
 * `erreur`/`info` (des retours d'action, qui rejoueraient une notification
 * à chaque retour sur l'écran), ni `nouveau` (qui rouvrirait le formulaire
 * de création), ni `tache`/`contact` (une fiche précise, pas un affichage),
 * ni un paramètre inventé par un visiteur — la mémoire d'affichage ne doit
 * pas devenir un entrepôt de texte libre.
 *
 * Trois niveaux de mémoire, et un seul endroit pour les accorder :
 * 1. l'ADRESSE porte le choix courant — c'est elle qui se copie et se
 *    partage, elle reste la vérité ;
 * 2. le COMPTE (`user_preferences`, par personne ET par organisation)
 *    garde le dernier état de chaque écran : revenir par la navigation,
 *    recharger, ouvrir depuis un autre navigateur retrouve l'écran ;
 * 3. la PÉRIODE est partagée par tous les écrans qui en ont une.
 */
export type DisplayScreen = {
  /** L'identifiant en base (`ecran:<key>`) — minuscules, tirets : la contrainte CHECK de la table l'exige. */
  key: string;
  /** Le chemin de l'écran, sans paramètre. */
  href: string;
  /** Les seuls paramètres d'adresse mémorisés, et les seuls qu'une vue enregistrée peut porter. */
  params: readonly string[];
  /** L'écran affiche le sélecteur de période partagé. */
  period?: boolean;
  /** L'écran porte des vues enregistrées (la valeur est celle de `saved_views.screen`). */
  view?: SavedViewScreen;
};

/** Les filtres analytiques communs, hérités du funnel (`parseMetricFilters`) — mêmes noms sur tous les écrans. */
const METRIC_PARAMS = ["periode", "du", "au", "conseiller", "type", "pipeline", "origine"] as const;

export const DISPLAY_SCREENS: readonly DisplayScreen[] = [
  { key: "dashboard", href: "/dashboard", params: ["periode", "du", "au"], period: true },
  { key: "taches", href: "/taches", params: ["v", "conseiller", "page"], view: "taches" },
  { key: "suivi", href: "/suivi", params: [] },
  {
    key: "contacts",
    href: "/contacts",
    params: ["v", "f", "q", "conseiller", "type", "activite", "tri", "dir", "page", "densite"],
    view: "contacts",
  },
  {
    key: "affaires",
    href: "/affaires",
    params: ["v", "f", ...METRIC_PARAMS, "vue", "etape", "tri", "dir", "page", "densite", "cohorte", "atteint", "jusqua", "issue", "motif", "depuis"],
    period: true,
    view: "affaires",
  },
  {
    key: "partenaires",
    href: "/partenaires",
    // Depuis le lot 3, la liste porte des chiffres datés (apports, affaires, montants) : elle a donc la période.
    params: ["v", "q", "metier", "statut", "conseiller", "tri", "dir", "densite", "periode", "du", "au"],
    period: true,
    view: "partenaires",
  },
  { key: "analytique-funnel", href: "/analytique/funnel", params: [...METRIC_PARAMS], period: true },
  { key: "analytique-delais", href: "/analytique/delais", params: [...METRIC_PARAMS], period: true },
  { key: "analytique-pertes", href: "/analytique/pertes", params: [...METRIC_PARAMS], period: true },
  { key: "analytique-partenaires", href: "/analytique/partenaires", params: [...METRIC_PARAMS], period: true },
  { key: "analytique-origines", href: "/analytique/origines", params: [...METRIC_PARAMS], period: true },
  { key: "emails-recus", href: "/emails-recus", params: ["onglet", "page"] },
  { key: "cibles", href: "/cibles", params: ["q", "page"] },
  { key: "regles", href: "/regles", params: [] },
  { key: "veille", href: "/veille", params: [] },
  { key: "newsletters", href: "/newsletters", params: [] },
] as const;

const BY_KEY = new Map(DISPLAY_SCREENS.map((s) => [s.key, s]));
/** Le plus long chemin d'abord : `/analytique/funnel` avant `/analytique`. */
const BY_LENGTH = [...DISPLAY_SCREENS].sort((a, b) => b.href.length - a.href.length);

export function displayScreen(key: string): DisplayScreen | undefined {
  return BY_KEY.get(key);
}

/**
 * L'écran d'un chemin : `/contacts` et `/contacts?q=x` oui, `/contacts/<id>`
 * non — une fiche n'est pas une liste, son adresse ne se mémorise pas.
 */
export function screenForPath(pathname: string): DisplayScreen | undefined {
  return BY_LENGTH.find((s) => s.href === pathname);
}

/** Les écrans qui portent des vues enregistrées, par clé de vue. */
export function screenForView(view: SavedViewScreen): DisplayScreen | undefined {
  return DISPLAY_SCREENS.find((s) => s.view === view);
}
