import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { AUTH_SETTINGS_BOUNDS, authSettings } from "@/db/schema";
import { AppError } from "@/lib/errors";

/**
 * Les réglages de l'authentification (une ligne en base) — lus par Auth.js
 * à CHAQUE requête pour la durée du lien et de la session. Mémoïsés une
 * minute en mémoire (et par requête via `cache`) : la coquille appelle
 * `auth()` sur chaque page, ce n'est pas une lecture de plus par écran.
 * Sans ligne (base pas encore migrée), les valeurs par défaut du schéma.
 */
export type AuthSettingsValues = { linkValidityMinutes: number; sessionDays: number };

export const DEFAULT_AUTH_SETTINGS: AuthSettingsValues = {
  linkValidityMinutes: AUTH_SETTINGS_BOUNDS.linkValidityMinutes.default,
  sessionDays: AUTH_SETTINGS_BOUNDS.sessionDays.default,
};

const MEMO_MS = 60_000;
let memo: { at: number; values: AuthSettingsValues } | null = null;

async function load(): Promise<AuthSettingsValues> {
  const now = Date.now();
  if (memo && now - memo.at < MEMO_MS) return memo.values;
  const row = await db.query.authSettings.findFirst({ where: eq(authSettings.id, 1) });
  const values = row ? { linkValidityMinutes: row.linkValidityMinutes, sessionDays: row.sessionDays } : DEFAULT_AUTH_SETTINGS;
  memo = { at: now, values };
  return values;
}

export const getAuthSettings = cache(load);

/** Pour les tests et après une écriture : la prochaine lecture repart en base. */
export function forgetAuthSettings(): void {
  memo = null;
}

function inBounds(value: number, bounds: { min: number; max: number }): boolean {
  return Number.isInteger(value) && value >= bounds.min && value <= bounds.max;
}

/** L'écriture — réservée au super admin par l'action qui l'appelle ; les bornes sont celles du schéma. */
export async function updateAuthSettings(values: AuthSettingsValues): Promise<void> {
  if (!inBounds(values.linkValidityMinutes, AUTH_SETTINGS_BOUNDS.linkValidityMinutes) || !inBounds(values.sessionDays, AUTH_SETTINGS_BOUNDS.sessionDays)) {
    throw new AppError("reglages_authentification_hors_bornes");
  }
  await db
    .insert(authSettings)
    .values({ id: 1, ...values, updatedAt: new Date() })
    .onConflictDoUpdate({ target: authSettings.id, set: { ...values, updatedAt: new Date() } });
  forgetAuthSettings();
}
