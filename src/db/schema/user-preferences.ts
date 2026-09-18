import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * L'ÉTAT D'AFFICHAGE PAR PERSONNE (lot 1, migration 0021) — ce que le
 * produit oubliait à chaque navigation : la période, le dernier état de
 * chaque écran (ses paramètres d'adresse), les colonnes choisies, la
 * densité, la vue d'accueil d'un module, plus tard les favoris et
 * l'épingle de la barre. Une ligne par personne, par organisation et par
 * clé : l'état suit la personne d'un navigateur à l'autre et ne fuit
 * jamais entre organisations (un super admin en substitution a le sien
 * dans chaque organisation où il travaille).
 *
 * `value` est du JSON libre borné par la clé : `periode` → une chaîne,
 * `ecran:<écran>` → l'objet des paramètres d'adresse, `colonnes:<tableau>`
 * → un tableau de clés, `vue-par-defaut:<écran>` → un identifiant de vue,
 * `vues-masquees` → des identifiants. Jamais une donnée métier.
 */
export const userPreferences = pgTable(
  "user_preferences",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.organizationId, table.key] }),
    check("user_preferences_key_shape", sql`${table.key} ~ '^[a-z-]+(:[a-z0-9_-]+)?$' AND length(${table.key}) <= 80`),
  ]
);

export type UserPreference = typeof userPreferences.$inferSelect;

/** Les écrans qui ont des vues : chaque liste du produit. */
export const SAVED_VIEW_SCREENS = ["contacts", "affaires", "partenaires", "taches", "newsletters", "emails-recus", "veille"] as const;
export type SavedViewScreen = (typeof SAVED_VIEW_SCREENS)[number];

/**
 * LES VUES ENREGISTRÉES (lot 1, migration 0021) — un objet nommé qui porte
 * filtres, colonnes et leur ordre, tri, groupement, densité et période
 * (`definition`, JSON). Personnelle par défaut (`owner_user_id` = la
 * personne, `shared` faux) ; partagée à l'équipe par l'admin seulement
 * (`shared` vrai). Les vues fournies d'origine sont semées par
 * organisation sans propriétaire (`owner_user_id` NULL, `shared` vrai) :
 * modifiables par l'admin, masquables par chacun (préférence
 * `vues-masquees`), jamais imposées. Une vue ne porte JAMAIS
 * d'identifiants de fiches : ses filtres sont rejoués côté serveur dans
 * les requêtes existantes, sous `orgScope` — un member qui ouvre l'adresse
 * d'une vue partagée ne voit que ce que son rôle autorise.
 */
export const savedViews = pgTable(
  "saved_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ownerUserId: uuid("owner_user_id").references(() => users.id, { onDelete: "cascade" }),
    screen: text("screen").notNull(),
    name: text("name").notNull(),
    definition: jsonb("definition").notNull(),
    shared: boolean("shared").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("saved_views_org_screen_idx").on(table.organizationId, table.screen),
    check("saved_views_screen_check", sql`${table.screen} IN ('contacts', 'affaires', 'partenaires', 'taches', 'newsletters', 'emails-recus', 'veille')`),
    check("saved_views_name_length", sql`length(${table.name}) BETWEEN 1 AND 80`),
    // Une vue fournie d'origine (sans propriétaire) est toujours partagée : elle n'appartient à personne.
    check("saved_views_seeded_are_shared", sql`${table.ownerUserId} IS NOT NULL OR ${table.shared} = true`),
  ]
);

export type SavedView = typeof savedViews.$inferSelect;
