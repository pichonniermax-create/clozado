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

/** « 12 j » — l'abréviation utilisée partout dans le suivi, insécable. */
export function formatDays(days: number): string {
  return `${days}${NNBSP}j`;
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
  const hours = days * 24;
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}${NNBSP}min`;
  if (days < 1) return `${Math.round(hours)}${NNBSP}h`;
  const formatted = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: days < 10 ? 1 : 0 }).format(days);
  return `${formatted}${NNBSP}j`;
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
