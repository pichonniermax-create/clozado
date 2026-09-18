import { cache } from "react";
import { and, eq, inArray, like, or } from "drizzle-orm";
import { db } from "@/db";
import { userPreferences } from "@/db/schema";
import { AppError } from "@/lib/errors";
import type { SessionUser } from "@/lib/session";

/**
 * L'ÉTAT D'AFFICHAGE PAR PERSONNE (lot 1) — une lecture par écran, jamais
 * une par composant : la coquille lit TOUTES les préférences de la personne
 * dans son organisation une fois (`cache` de React, indexé sur l'objet
 * utilisateur mémoïsé de `requireUser`), et la page, la navigation et les
 * tableaux se servent dedans.
 *
 * Deux garde-fous portés ici, pas dans les écrans :
 * - sans organisation (super admin en vue globale), il n'y a rien à
 *   mémoriser : la paire (personne, organisation) est la clé ;
 * - un visiteur de la démo publique n'écrit jamais (le proxy refuse déjà
 *   ses POST ; on ne tente même pas la requête).
 */
export type Preferences = ReadonlyMap<string, unknown>;

const EMPTY: Preferences = new Map();

/** Les clés du produit — écrites ici une fois pour qu'aucun écran n'en invente une (la contrainte CHECK les borne). */
export const PREF = {
  /** La période partagée par tous les écrans qui en ont une. */
  period: "periode",
  /** La densité des listes. */
  density: "densite",
  /** Les vues fournies que la personne a masquées : un tableau d'identifiants. */
  hiddenViews: "vues-masquees",
  /** Le dernier état d'un écran : ses paramètres d'adresse. */
  screen: (key: string) => `ecran:${key}`,
  /** Les colonnes choisies d'un tableau. */
  columns: (table: string) => `colonnes:${table}`,
  /** La vue ouverte par défaut sur un écran. */
  defaultView: (screen: string) => `vue-par-defaut:${screen}`,
  /** L'ordre des vues d'un écran, choisi par la personne (lot 1, reste) : des identifiants de vues. */
  viewOrder: (screen: string) => `ordre-vues:${screen}`,
  /** La barre de navigation reste dépliée (lot 4) : vrai ou faux. */
  navPinned: "nav:epingle",
  /** Les écrans épinglés en haut de la barre (lot 4) : des chemins, dans l'ordre choisi. */
  navFavorites: "nav:favoris",
} as const;

/** Les préfixes qu'une réinitialisation d'affichage efface (les vues enregistrées, elles, survivent). */
const RESETTABLE_PREFIXES = ["ecran:", "colonnes:", "vue-par-defaut:", "ordre-vues:"] as const;
const RESETTABLE_KEYS = [PREF.period, PREF.density, PREF.hiddenViews] as const;

/** La même contrainte qu'en base, vérifiée avant l'aller-retour : une clé inventée n'atteint pas la base. */
const KEY_SHAPE = /^[a-z-]+(:[a-z0-9_-]+)?$/;

function scopeOf(user: SessionUser): { userId: string; organizationId: string } | null {
  if (!user.organizationId) return null;
  return { userId: user.id, organizationId: user.organizationId };
}

async function load(user: SessionUser): Promise<Preferences> {
  const scope = scopeOf(user);
  if (!scope) return EMPTY;
  const rows = await db
    .select({ key: userPreferences.key, value: userPreferences.value })
    .from(userPreferences)
    .where(and(eq(userPreferences.userId, scope.userId), eq(userPreferences.organizationId, scope.organizationId)));
  return new Map(rows.map((row) => [row.key, row.value]));
}

/** Toutes les préférences de la personne dans SON organisation — une seule fois par requête. */
export const getPreferences = cache(load);

/** Une préférence typée « chaîne » (période, densité, identifiant de vue). */
export function preferenceString(preferences: Preferences, key: string): string | undefined {
  const value = preferences.get(key);
  return typeof value === "string" ? value : undefined;
}

/** Une préférence typée « liste de chaînes » (colonnes, vues masquées). */
export function preferenceList(preferences: Preferences, key: string): string[] | undefined {
  const value = preferences.get(key);
  return Array.isArray(value) && value.every((v) => typeof v === "string") ? (value as string[]) : undefined;
}

/**
 * Écrit une préférence. Insertion ou mise à jour sur la clé primaire
 * (personne, organisation, clé) : jamais de doublon, jamais de lecture
 * préalable. `null` efface la ligne.
 */
export async function rememberPreference(user: SessionUser, key: string, value: unknown): Promise<void> {
  const scope = scopeOf(user);
  if (!scope || user.readOnly) return;
  if (!KEY_SHAPE.test(key) || key.length > 80) throw new AppError("preference_inconnue");
  if (value === null || value === undefined) {
    await db
      .delete(userPreferences)
      .where(and(eq(userPreferences.userId, scope.userId), eq(userPreferences.organizationId, scope.organizationId), eq(userPreferences.key, key)));
    return;
  }
  await db
    .insert(userPreferences)
    .values({ ...scope, key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [userPreferences.userId, userPreferences.organizationId, userPreferences.key],
      set: { value, updatedAt: new Date() },
    });
}

/**
 * « Réinitialiser l'affichage » : tout l'état d'affichage de la personne
 * dans cette organisation (un écran nommé, ou tout), SANS toucher aux vues
 * enregistrées — on remet la fenêtre en ordre, on ne jette pas le travail.
 */
export async function resetPreferences(user: SessionUser, screenKey?: string): Promise<void> {
  const scope = scopeOf(user);
  if (!scope || user.readOnly) return;
  const mine = and(eq(userPreferences.userId, scope.userId), eq(userPreferences.organizationId, scope.organizationId));
  if (screenKey) {
    await db.delete(userPreferences).where(and(mine, inArray(userPreferences.key, [PREF.screen(screenKey), PREF.defaultView(screenKey)])));
    return;
  }
  await db
    .delete(userPreferences)
    .where(and(mine, or(inArray(userPreferences.key, [...RESETTABLE_KEYS]), ...RESETTABLE_PREFIXES.map((prefix) => like(userPreferences.key, `${prefix}%`)))));
}
