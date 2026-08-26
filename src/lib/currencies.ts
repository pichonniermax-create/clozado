/**
 * Les devises d'affichage qu'une organisation peut choisir (ISO 4217). La
 * base n'impose rien (`organizations.currency` est un texte) : c'est ici
 * que la liste vit, et c'est ici qu'elle s'allonge. Les montants sont
 * stockés tels quels — la devise ne convertit rien, elle dit comment lire.
 */
export const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "CAD"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const DEFAULT_CURRENCY: Currency = "EUR";

export function isCurrency(value: unknown): value is Currency {
  return typeof value === "string" && (CURRENCIES as readonly string[]).includes(value);
}

export function toCurrency(value: unknown): Currency {
  return isCurrency(value) ? value : DEFAULT_CURRENCY;
}

/** Le nom d'une devise dans une langue (« euro », « US dollar ») — par `Intl`. */
export function currencyDisplayName(currency: string, intlLocale: string): string {
  return new Intl.DisplayNames([intlLocale], { type: "currency" }).of(currency) ?? currency;
}
