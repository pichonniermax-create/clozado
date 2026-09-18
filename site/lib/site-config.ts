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
   * L'application. Elle n'a pas encore de domaine propre : le jour où elle
   * passe sur `https://app.clozado.fr`, cette ligne — et elle seule — change.
   */
  appOrigin: "https://clozado.vercel.app",

  /**
   * Le lien de prise de rendez-vous. Provisoire : il sera remplacé par le
   * module de réservation quand il existera dans le produit. Un lien
   * simple, jamais un script embarqué — aucun tiers ne s'exécute ici.
   */
  bookingUrl: "https://meetings.hubspot.com/mpichonnier",
} as const;

/** La démonstration publique, en lecture seule, servie par l'application. */
export const DEMO_URL = `${SITE_CONFIG.appOrigin}/demo`;
