/**
 * Ce que le proxy (`src/proxy.ts`) et le reste du produit partagent au
 * sujet de la démo publique (docs/module-demo.md §1.4) — SANS dépendance
 * Node : ce module est importé par le proxy, qui doit rester léger.
 */

/** Le cookie de la session de visite : un JWT signé par `AUTH_SECRET`, avec son propre sel (le nom du cookie). */
export const DEMO_COOKIE = "clozado-demo";

/** Une visite dure au plus huit heures ; éteindre l'interrupteur la termine à la requête suivante. */
export const DEMO_SESSION_MAX_AGE = 8 * 3600;

/**
 * Les chemins qu'un visiteur ne voit jamais, même en lecture : réglages
 * (marque, domaine, adresse d'ingestion, envois automatiques, clés), profil
 * (Calendly, lien de rendez-vous), import de contacts, et toutes les
 * routes API (exports, rendu, modèle, webhooks).
 */
export const DEMO_FORBIDDEN_PATHS = ["/settings", "/profil", "/contacts/import", "/api"] as const;

/** Le paramètre d'URL posé quand une écriture a été refusée : la coquille montre la phrase « lecture seule ». */
export const DEMO_READ_ONLY_PARAM = "demo";
export const DEMO_READ_ONLY_VALUE = "lecture-seule";

/**
 * Un préchargement du routeur client de Next (`Link` à l'écran ou survolé) :
 * il porte `Next-Router-Prefetch: 1`. Une requête qui AGIT (sortie de la
 * démo) ne doit jamais être déclenchée par un préchargement — constaté le
 * 2026-09-04 : le bandeau préchargeait `/demo/quitter` et la visite mourait
 * à l'affichage. Valable dans une ROUTE (`route.ts`), qui reçoit l'en-tête ;
 * pas dans le proxy — Next retire les en-têtes « flight » (`rsc`,
 * `next-router-prefetch`, `_rsc`) avant d'appeler le middleware
 * (`server/web/adapter.js`, « Headers should only be stripped for
 * middleware ») : là, c'est `isNavigation` qui fait foi.
 */
export function isRouterPrefetch(headers: Headers): boolean {
  return headers.get("next-router-prefetch") === "1";
}

/**
 * Une vraie navigation (barre d'adresse, lien `<a>`, soumission) — par les
 * Fetch Metadata du navigateur (`Sec-Fetch-Mode: navigate`), que Next ne
 * retire pas. Un préchargement ou une transition client du routeur est en
 * mode `cors` ; un client sans ces en-têtes (curl, script) compte comme une
 * navigation, la lecture fermée par défaut n'y perd rien.
 */
export function isNavigation(headers: Headers): boolean {
  const mode = headers.get("sec-fetch-mode");
  return mode === null || mode === "navigate";
}

/** Le paramètre qui fait démarrer la visite guidée (sous-étape 5). */
export const DEMO_TOUR_PARAM = "visite";
