/**
 * Les langues de l'INTERFACE (chantier marque blanche et
 * internationalisation, étape 4). Trois langues coexistent dans le
 * produit et ne se confondent pas : celle-ci — par utilisateur, mémorisée
 * (`users.locale`), sinon celle de l'organisation (`organizations.
 * default_locale`), sinon le français ; celle des CONTENUS GÉNÉRÉS (le
 * paramètre `lang` de la conception par le modèle) ; celle des CONTENUS DU
 * CLIENT (saisis par lui, jamais traduits).
 *
 * Ajouter une langue : un dossier `src/messages/<code>/` avec les mêmes
 * fichiers que `fr/`, et son code ici — rien d'autre (les formats de
 * dates, nombres et devises suivent par `Intl`).
 */
export const LOCALES = ["fr"] as const;
export type AppLocale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "fr";

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Une valeur venue de la base ou d'un réglage → une langue connue, sinon le français. */
export function toAppLocale(value: unknown): AppLocale {
  return isAppLocale(value) ? value : DEFAULT_LOCALE;
}
