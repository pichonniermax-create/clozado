import { sql } from "drizzle-orm";
import { check, integer, pgTable, smallint, text, timestamp } from "drizzle-orm/pg-core";

/**
 * LES RÉGLAGES DE L'AUTHENTIFICATION (correctif du 2026-09-17, migration
 * 0020) — une seule ligne (`id = 1`), lue à chaque requête par Auth.js :
 * la durée de validité d'un lien de connexion et la durée d'une session.
 * En base et modifiables (espace gestionnaire du super admin), jamais en
 * dur : avant, Auth.js posait 24 heures pour le lien et 30 jours pour la
 * session, dans le code.
 */
export const AUTH_SETTINGS_BOUNDS = {
  linkValidityMinutes: { min: 5, max: 24 * 60, default: 60 },
  sessionDays: { min: 1, max: 90, default: 30 },
} as const;

export const authSettings = pgTable(
  "auth_settings",
  {
    id: smallint("id").primaryKey().default(1),
    linkValidityMinutes: integer("link_validity_minutes").notNull().default(AUTH_SETTINGS_BOUNDS.linkValidityMinutes.default),
    sessionDays: integer("session_days").notNull().default(AUTH_SETTINGS_BOUNDS.sessionDays.default),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("auth_settings_single_row", sql`${table.id} = 1`),
    check("auth_settings_link_validity_bounds", sql`${table.linkValidityMinutes} BETWEEN 5 AND 1440`),
    check("auth_settings_session_bounds", sql`${table.sessionDays} BETWEEN 1 AND 90`),
  ]
);

export type AuthSettings = typeof authSettings.$inferSelect;

/**
 * LE CODE À SIX CHIFFRES du lien de connexion (correctif du 2026-09-17) :
 * affiché dans l'email à côté du lien, saisissable sur la page de
 * connexion quand le lien pose problème. Un code par adresse (le dernier
 * envoyé remplace le précédent), haché comme le jeton d'Auth.js, expirant
 * avec le lien, et comptant ses essais : au-delà de la limite, il meurt —
 * un million de combinaisons ne se devinent pas en cinq essais.
 */
export const LOGIN_CODE_MAX_ATTEMPTS = 5;

export const loginCodes = pgTable("login_codes", {
  email: text("email").primaryKey(),
  codeHash: text("code_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LoginCode = typeof loginCodes.$inferSelect;
