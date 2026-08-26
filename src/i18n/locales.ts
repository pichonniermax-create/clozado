/**
 * Les langues de l'INTERFACE (chantier marque blanche et
 * internationalisation, étapes 4 et 5). Trois langues coexistent dans le
 * produit et ne se confondent pas : celle-ci — par utilisateur, mémorisée
 * (`users.locale`), sinon celle de l'organisation (`organizations.
 * default_locale`), sinon le français ; celle des CONTENUS GÉNÉRÉS (le
 * paramètre `lang` de la conception par le modèle, par défaut celle de
 * l'organisation) ; celle des CONTENUS DU CLIENT (saisis par lui, jamais
 * traduits).
 *
 * Ajouter une langue : un dossier `src/messages/<code>/` avec les mêmes
 * fichiers que `fr/`, son chargeur dans `messages.ts`, son code ici avec
 * son étiquette `Intl` — rien d'autre (les formats de dates, nombres et
 * devises suivent par `Intl`).
 */
export const LOCALES = ["fr", "en"] as const;
export type AppLocale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "fr";

/**
 * L'étiquette `Intl` de chaque langue — la convention régionale des
 * formats (« 1 200,50 € » / « €1,200.50 », « 26 août 2026 » / « 26 August
 * 2026 »). L'anglais est britannique : la clientèle est européenne et
 * l'ordre jour-mois-année est celui du français (décision réversible).
 */
export const INTL_LOCALES: Record<AppLocale, string> = { fr: "fr-FR", en: "en-GB" };

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Une valeur venue de la base ou d'un réglage → une langue connue, sinon le français. */
export function toAppLocale(value: unknown): AppLocale {
  return isAppLocale(value) ? value : DEFAULT_LOCALE;
}

/** Le nom d'une langue dans cette langue même (« Français », « English ») — par `Intl`, jamais en dur. */
export function localeDisplayName(locale: AppLocale): string {
  const name = new Intl.DisplayNames([INTL_LOCALES[locale]], { type: "language" }).of(locale) ?? locale;
  return name.charAt(0).toUpperCase() + name.slice(1);
}
