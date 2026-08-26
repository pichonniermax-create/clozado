/**
 * Pur affichage — tout le formatage français du produit, aucune logique
 * métier. Une seule définition par format : on étend CE fichier, on
 * n'écrit jamais un `Intl.*` local dans un écran (la duplication avait
 * commencé : une `formatDate` locale dans la liste des newsletters).
 */

import { PRODUCT_TIMEZONE } from "@/lib/timezone";

/** Espace fine insécable — un « 12 j » ou un « 1,5 % » ne se coupe jamais en fin de ligne. */
const NNBSP = "\u202f";

export function firstNameOf(fullName: string): string {
  const trimmed = fullName.trim();
  return trimmed.split(/\s+/)[0] || trimmed;
}

export function formatEuros(amount: string | number | null): string | null {
  if (amount == null) return null;
  const n = Number(amount);
  if (Number.isNaN(n)) return null;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

/** « 1,5 % » — virgule française et unité collée au nombre. */
export function formatPercent(rate: string | number | null): string | null {
  if (rate == null || rate === "") return null;
  const n = Number(rate);
  if (Number.isNaN(n)) return null;
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n)}${NNBSP}%`;
}

/** « 12 j » — l'abréviation utilisée partout dans le suivi, insécable (l'unité vient d'`Intl`, pas d'une lettre en dur). */
export function formatDays(days: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "unit", unit: "day", unitDisplay: "short", maximumFractionDigits: 0 }).format(days).replace(/\s/g, NNBSP);
}

export function formatCommission(commission: {
  basis: "percentage" | "fixed";
  rate: string | null;
  fixedAmount: string | null;
  computedAmount: string | null;
}): string {
  const base =
    commission.basis === "percentage"
      ? formatPercent(commission.rate)
      : formatEuros(commission.fixedAmount);
  const computed = formatEuros(commission.computedAmount);
  if (base && computed) return `${base} · ≈ ${computed}`;
  return base ?? computed ?? "—";
}

/**
 * Dates et heures rendues dans le fuseau du produit (Europe/Paris), jamais
 * dans celui du serveur : sans cela, une interaction consignée à 10 h
 * s'affichait 08 h une fois déployée (Vercel est en UTC).
 */
export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: PRODUCT_TIMEZONE,
  }).format(typeof date === "string" ? new Date(date) : date);
}

export function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: PRODUCT_TIMEZONE,
  }).format(typeof date === "string" ? new Date(date) : date);
}

/**
 * Une durée MESURÉE (médiane, moyenne), reçue en jours décimaux, à l'échelle
 * où elle se lit : « 12 min », « 7 h », « 3,5 j », « 42 j » — une décimale
 * sous dix jours, aucune au-delà. Distinct de `formatDays`, qui affiche un
 * nombre de jours entiers déjà décidé (le suivi).
 */
export function formatDuration(days: number): string {
  if (!Number.isFinite(days) || days < 0) return "—";
  const unit = (value: number, unitName: "minute" | "hour" | "day", digits: number) =>
    new Intl.NumberFormat("fr-FR", { style: "unit", unit: unitName, unitDisplay: "short", maximumFractionDigits: digits }).format(value).replace(/\s/g, NNBSP);
  const hours = days * 24;
  if (hours < 1) return unit(Math.max(1, Math.round(hours * 60)), "minute", 0);
  if (days < 1) return unit(Math.round(hours), "hour", 0);
  return unit(days, "day", days < 10 ? 1 : 0);
}

/**
 * Un TAUX (pour-cent, 0–100, parfois au-delà) : « 62 % », « 3,5 % » — une
 * décimale sous dix pour cent, aucune au-delà ; un taux non nul mais
 * inférieur à un dixième s'écrit « < 0,1 % » plutôt que « 0 % ».
 */
export function formatRate(percent: number): string {
  if (!Number.isFinite(percent) || percent < 0) return "—";
  if (percent > 0 && percent < 0.1) return `<${NNBSP}0,1${NNBSP}%`;
  const formatted = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: percent < 10 ? 1 : 0 }).format(percent);
  return `${formatted}${NNBSP}%`;
}

/**
 * « il y a 3 min », « il y a 5 h », « il y a 2 j », « maintenant » — l'âge
 * d'une collecte ou d'une lecture, pour dire si la matière est fraîche,
 * écrit par `Intl.RelativeTimeFormat` (aucun mot en dur : la langue de
 * l'organisation suivra à l'étape 5). Au-delà de sept jours, la date
 * elle-même vaut mieux qu'un compte.
 */
export function formatRelativeTime(date: Date | string, now = new Date()): string {
  const then = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000));
  const relative = new Intl.RelativeTimeFormat("fr-FR", { style: "short", numeric: "auto" });
  const tidy = (s: string) => s.replace(/\s(min|h|j)$/, `${NNBSP}$1`);
  if (seconds < 60) return relative.format(0, "second");
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return tidy(relative.format(-minutes, "minute"));
  const hours = Math.round(minutes / 60);
  if (hours < 24) return tidy(relative.format(-hours, "hour"));
  const days = Math.round(hours / 24);
  if (days <= 7) return tidy(new Intl.RelativeTimeFormat("fr-FR", { style: "short", numeric: "always" }).format(-days, "day"));
  return formatDate(then);
}

/** « France », « Royaume-Uni », « Union européenne » depuis un code ISO à deux lettres ; le code lui-même si l'on ne sait pas. */
export function formatCountry(code: string | null): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(["fr"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}
