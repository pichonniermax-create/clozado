import type { AppLocale } from "./locales";

/**
 * Le chargement des messages d'une langue (chantier marque blanche et
 * i18n, étape 4). Un import par langue : le serveur charge celle de la
 * requête, jamais les autres.
 */
const LOADERS: Record<AppLocale, () => Promise<{ default: Messages }>> = {
  fr: () => import("@/messages/fr"),
  en: () => import("@/messages/en"),
};

export type Messages = typeof import("@/messages/fr").default;

export async function loadMessages(locale: AppLocale): Promise<Messages> {
  return (await LOADERS[locale]()).default;
}

/**
 * Les namespaces dont les composants CLIENT ont besoin — les seuls que le
 * fournisseur client sérialise dans la page (le reste ne sert qu'au rendu
 * serveur). Tenue à jour avec les `useTranslations("…")` des fichiers
 * `"use client"` — la règle ESLint `local/client-namespaces` refuse un
 * composant client qui lirait un espace absent d'ici.
 */
export const CLIENT_NAMESPACES = [
  "auth",
  "brand",
  "contacts",
  "deals",
  "demo",
  "nav",
  "newsletters",
  "rules",
  "settings",
  "shares",
  "shell",
  "targets",
  "tour",
  "ui",
  "watch",
] as const satisfies readonly (keyof Messages)[];

export function pickClientMessages(messages: Messages): Partial<Messages> {
  const picked: Partial<Messages> = {};
  for (const ns of CLIENT_NAMESPACES) (picked as Record<string, unknown>)[ns] = messages[ns];
  return picked;
}
