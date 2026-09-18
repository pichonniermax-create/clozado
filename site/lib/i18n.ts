import { fr } from "@/content/fr";

/**
 * LES LANGUES DU SITE. Ajouter l'anglais, c'est ajouter `"en"` à `LOCALES`,
 * un dossier `content/en/` et sa ligne dans `DICTIONARIES` : aucune page,
 * aucun composant, aucune adresse n'est à réécrire. Le segment de langue
 * est dans l'URL depuis le premier jour, les balises `hreflang` sont
 * posées, et le sélecteur de langue se démasque tout seul dès qu'il y a
 * plus d'une entrée ici.
 */
export const LOCALES = ["fr"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "fr";

/** Le dictionnaire de référence : toute autre langue doit lui être identique en forme. */
export type Dictionary = typeof fr;

const DICTIONARIES: Record<Locale, Dictionary> = { fr };

/** L'attribut `lang` du document, et l'`og:locale` — plus précis que le code de langue seul. */
export const HTML_LANG: Record<Locale, string> = { fr: "fr-FR" };
export const OG_LOCALE: Record<Locale, string> = { fr: "fr_FR" };

/** Le libellé du sélecteur de langue, dans sa propre langue. */
export const LOCALE_LABEL: Record<Locale, string> = { fr: "Français" };

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}

/** Vrai tant qu'il n'y a qu'une langue : le sélecteur reste masqué, le reste est déjà en place. */
export const IS_MONOLINGUAL = LOCALES.length === 1;
