/**
 * LE SEUL FICHIER À MODIFIER quand une adresse change. Rien d'autre dans
 * le site ne cite une URL en dur — ni un composant, ni un contenu.
 */
export const SITE_CONFIG = {
  /**
   * L'origine canonique du site. Elle reste `clozado.fr` même pendant que
   * le site vit sur une adresse Vercel provisoire : les balises canoniques
   * pointent le domaine final, donc les moteurs n'indexent pas la copie
   * provisoire.
   */
  origin: "https://clozado.fr",

  /**
   * L'application, sur son domaine propre depuis le 2026-09-18 (vérifié :
   * `/`, `/login` et `/inscription` répondent 200, `/demo` renvoie vers le
   * tableau de bord de démonstration). Plus aucune adresse `.vercel.app`
   * n'est citée par le site.
   */
  appOrigin: "https://app.clozado.fr",

} as const;

/** La démonstration publique, en lecture seule, servie par l'application. */
export const DEMO_URL = `${SITE_CONFIG.appOrigin}/demo`;

/**
 * LA PRISE DE RENDEZ-VOUS — chez nous, et nulle part ailleurs.
 *
 * Le site envoyait jusqu'au 2026-09-21 sur un AGENDA TIERS, hébergé hors
 * de notre domaine. C'était le seul tiers que le site touchait, et il
 * recevait le geste principal : le visiteur quittait le domaine, et sa
 * saisie partait chez un prestataire dont la politique n'est pas la nôtre.
 * Décision de l'éditeur, le 2026-09-21 : il disparaît entièrement, nom
 * compris — le dépôt ne doit plus en porter une seule occurrence.
 *
 * L'adresse de remplacement est la page de réservation de l'application.
 * Elle est écrite ICI, une fois, et nulle part ailleurs.
 */
export const RESERVATION_URL = `${SITE_CONFIG.appOrigin}/reserver`;

/**
 * TANT QU'ELLE N'EST PAS EN LIGNE, AUCUN BOUTON NE L'ANNONCE. « Ouvrir la
 * démonstration » reste le seul appel à l'action du site : mieux vaut un
 * seul geste possible que deux dont l'un mène à une page absente.
 *
 * Passer cette ligne à `true` remet la réservation en service PARTOUT —
 * les six boutons, l'entrée du repli mobile, la carte de la page
 * Démonstration, et la ligne de la politique de confidentialité qui la
 * décrit (`quand: "reservation"` dans `content/fr/confidentialite.ts`).
 * Il n'y a rien d'autre à chercher.
 */
export const RESERVATION_EN_LIGNE = false;

/** L'écran de connexion de l'application. */
export const LOGIN_URL = `${SITE_CONFIG.appOrigin}/login`;

/*
 * L'ÉCRAN DE BIENVENUE, c'est la RACINE de l'application : une adresse
 * e-mail puis « Continuer », qui oriente ensuite vers la connexion ou la
 * création d'espace. C'est donc là qu'arrivent `/inscription` et `/signup`
 * (redirections de `vercel.json`) — aucune constante ici, puisqu'aucun lien
 * du site n'y mène directement.
 */
