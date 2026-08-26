/**
 * Pur affichage — tout le formatage du produit, aucune logique métier. Un
 * objet `Formats` par requête (ou par organisation, hors requête), construit
 * sur la LANGUE de la personne, la DEVISE et le FUSEAU de l'organisation :
 * on étend CE fichier, on n'écrit jamais un `Intl.*` local dans un écran.
 * Le serveur l'obtient par `getFormats()` (src/i18n/formats.ts), un
 * composant client par `useFormats()`, une fonction de bibliothèque le
 * reçoit en paramètre — comme un traducteur.
 */

import { DEFAULT_LOCALE, INTL_LOCALES, type AppLocale } from "@/i18n/locales";
import { DEFAULT_CURRENCY } from "@/lib/currencies";
import { PRODUCT_TIMEZONE, todayInTimeZone } from "@/lib/timezone";

/** Espace fine insécable — un « 12 j » ou un « 1,5 % » ne se coupe jamais en fin de ligne. */
const NNBSP = "\u202f";

export type FormatSettings = { locale: AppLocale; currency: string; timeZone: string };

/** Les formats du produit lui-même — sans personne ni organisation (écrans publics, espace gestionnaire). */
export const PRODUCT_FORMATS: FormatSettings = { locale: DEFAULT_LOCALE, currency: DEFAULT_CURRENCY, timeZone: PRODUCT_TIMEZONE };

export function firstNameOf(fullName: string): string {
  const trimmed = fullName.trim();
  return trimmed.split(/\s+/)[0] || trimmed;
}

const toDate = (date: Date | string) => (typeof date === "string" ? new Date(date) : date);

export function createFormats(settings: FormatSettings) {
  const { locale, currency, timeZone } = settings;
  const tag = INTL_LOCALES[locale];
  const number = (options: Intl.NumberFormatOptions) => new Intl.NumberFormat(tag, options);
  /** Un nombre avec une unité courte, insécable : « 12 j », « 7 h », « 3.5 days ». */
  const unit = (value: number, unitName: "minute" | "hour" | "day", digits: number) =>
    number({ style: "unit", unit: unitName, unitDisplay: "short", maximumFractionDigits: digits }).format(value).replace(/\s/g, NNBSP);

  /** « 12 000 € », « €12,000 » — dans la devise de l'organisation, sans décimales. */
  const money = (amount: string | number | null): string | null => {
    if (amount == null) return null;
    const n = Number(amount);
    if (Number.isNaN(n)) return null;
    return number({ style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  };

  /** « 1,5 % » / « 1.5 % » — le séparateur de la langue, l'unité collée au nombre. */
  const percent = (rate: string | number | null): string | null => {
    if (rate == null || rate === "") return null;
    const n = Number(rate);
    if (Number.isNaN(n)) return null;
    return `${number({ maximumFractionDigits: 2 }).format(n)}${NNBSP}%`;
  };

  /** « 12 j » / « 12 days » — un nombre de jours entiers déjà décidé (le suivi), insécable. */
  const days = (value: number): string => unit(value, "day", 0);

  const commission = (c: { basis: "percentage" | "fixed"; rate: string | null; fixedAmount: string | null; computedAmount: string | null }): string => {
    const base = c.basis === "percentage" ? percent(c.rate) : money(c.fixedAmount);
    const computed = money(c.computedAmount);
    if (base && computed) return `${base} · ≈ ${computed}`;
    return base ?? computed ?? "—";
  };

  /** « 26 août 2026 » / « 26 August 2026 », dans le fuseau de l'organisation. */
  const date = (value: Date | string): string =>
    new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric", timeZone }).format(toDate(value));

  /** « 26 août, 17:13 » / « 26 Aug, 17:13 ». */
  const dateTime = (value: Date | string): string =>
    new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone }).format(toDate(value));

  /** « 26 août » / « 26 Aug » — la forme la plus courte, pour une carte. */
  const shortDate = (value: Date | string): string =>
    new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", timeZone }).format(toDate(value));

  /**
   * Une durée MESURÉE (médiane, moyenne), reçue en jours décimaux, à l'échelle
   * où elle se lit : « 12 min », « 7 h », « 3,5 j », « 42 j » — une décimale
   * sous dix jours, aucune au-delà. Distinct de `days`, qui affiche un
   * nombre de jours entiers déjà décidé.
   */
  const duration = (value: number): string => {
    if (!Number.isFinite(value) || value < 0) return "—";
    const hours = value * 24;
    if (hours < 1) return unit(Math.max(1, Math.round(hours * 60)), "minute", 0);
    if (value < 1) return unit(Math.round(hours), "hour", 0);
    return unit(value, "day", value < 10 ? 1 : 0);
  };

  /**
   * Un TAUX (pour-cent, 0–100, parfois au-delà) : « 62 % », « 3,5 % » — une
   * décimale sous dix pour cent, aucune au-delà ; un taux non nul mais
   * inférieur à un dixième s'écrit « < 0,1 % » plutôt que « 0 % ».
   */
  const rate = (value: number): string => {
    if (!Number.isFinite(value) || value < 0) return "—";
    if (value > 0 && value < 0.1) return `<${NNBSP}${number({ minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(0.1)}${NNBSP}%`;
    return `${number({ maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)}${NNBSP}%`;
  };

  /**
   * « il y a 3 min », « 5 hr ago », « dans 2 h », « maintenant » — l'âge d'une
   * collecte ou l'attente d'un nouvel essai, écrit par `Intl.RelativeTimeFormat`
   * (passé comme futur). Au-delà de sept jours, la date elle-même vaut mieux
   * qu'un compte.
   */
  const relative = (value: Date | string, now = new Date()): string => {
    const then = toDate(value);
    const delta = Math.round((then.getTime() - now.getTime()) / 1000);
    const sign = delta < 0 ? -1 : 1;
    const seconds = Math.abs(delta);
    const auto = new Intl.RelativeTimeFormat(tag, { style: "short", numeric: "auto" });
    // Le nombre et son unité courte ne se séparent pas en fin de ligne.
    const tidy = (s: string) => s.replace(/(\d)\s(\S{1,3})(\s|$)/, `$1${NNBSP}$2$3`);
    if (seconds < 60) return auto.format(0, "second");
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return tidy(auto.format(sign * minutes, "minute"));
    const hours = Math.round(minutes / 60);
    if (hours < 24) return tidy(auto.format(sign * hours, "hour"));
    const daysAway = Math.round(hours / 24);
    if (daysAway <= 7) return tidy(new Intl.RelativeTimeFormat(tag, { style: "short", numeric: "always" }).format(sign * daysAway, "day"));
    return date(then);
  };

  /** « France », « United Kingdom » depuis un code ISO à deux lettres ; le code lui-même si l'on ne sait pas. */
  const country = (code: string | null): string | null => {
    if (!code) return null;
    try {
      return new Intl.DisplayNames([tag], { type: "region" }).of(code.toUpperCase()) ?? code;
    } catch {
      return code;
    }
  };

  /** « a, b et c » / « a, b, and c » — une liste en mots, par `Intl.ListFormat`. */
  const list = (items: string[]): string => new Intl.ListFormat(tag, { type: "conjunction" }).format(items);

  /** « 2026-08-26 » — la date du jour de l'organisation, pour un champ `<input type=date>`. */
  const todayInput = (now = new Date()): string => todayInTimeZone(timeZone, now);

  return { locale, currency, timeZone, tag, money, percent, days, commission, date, dateTime, shortDate, duration, rate, relative, country, list, todayInput };
}

export type Formats = ReturnType<typeof createFormats>;
