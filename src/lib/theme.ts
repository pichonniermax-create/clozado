/**
 * LE THÈME de l'interface (chantier UI/UX) : clair, sombre, ou celui du
 * système — le choix de la personne vit dans un cookie par navigateur
 * (`clozado-theme`, un an), lu par la mise en page racine pour poser la
 * classe `dark` AVANT le premier rendu (aucun clignotement). « Système »
 * ne pose rien côté serveur : un script minuscule dans `<head>` lit la
 * préférence du navigateur avant la première peinture. Les jetons sombres
 * existaient déjà dans globals.css et dans les jetons de marque dérivés
 * (`BrandStyle`) ; ceci n'est que l'interrupteur.
 */
export const THEME_COOKIE = "clozado-theme";
export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE_MAX_AGE = 365 * 24 * 3600;

export function parseTheme(value: string | undefined | null): Theme {
  return (THEMES as readonly string[]).includes(value ?? "") ? (value as Theme) : "system";
}

/**
 * Le script inline de « système » : appliqué avant la première peinture,
 * il pose `dark` si le navigateur le demande. Sans dépendance, sans
 * accès à autre chose que `matchMedia` — et rien si la personne a choisi.
 */
// eslint-disable-next-line local/no-visible-text -- un script exécuté par le navigateur, jamais un texte affiché
export const SYSTEM_THEME_SCRIPT = `(function(){try{if(window.matchMedia("(prefers-color-scheme: dark)").matches){document.documentElement.classList.add("dark")}}catch(e){}})();`;
