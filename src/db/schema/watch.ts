import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * LA VEILLE — la matière réelle du composer (docs/module-ciblage-contenu.md,
 * partie 2). Trois familles : les SUJETS que l'organisation déclare, les
 * SOURCES qu'elle suit (sites ou flux thématiques, et CONCURRENTS nommés —
 * uniquement ce qu'ils publient publiquement), et les ARTICLES collectés.
 *
 * DROIT D'AUTEUR, RÈGLE ABSOLUE, TENUE PAR LE SCHÉMA : un article, c'est un
 * titre, un lien, une date, une source, un pays, une langue, et un RÉSUMÉ
 * ORIGINAL écrit par l'IA. Il n'existe AUCUNE colonne pour le corps ni
 * l'extrait d'un article — rien ne peut être stocké, donc rien ne peut
 * être reproduit. Tout est par organisation, FK composites comprises.
 */

/** Un sujet de veille déclaré par l'organisation (« crédit immobilier », « SCPI », « fiscalité »…). */
export const watchTopics = pgTable(
  "watch_topics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    /** Termes de recherche pour les sujets sans flux ; vide = le libellé. */
    searchTerms: text("search_terms").array().notNull().default([]),
    /** Langues cherchées (« fr », « en ») : sources françaises ET anglophones, au choix de l'organisation. */
    searchLanguages: text("search_languages").array().notNull().default(["fr"]),
    position: integer("position").notNull().default(0),
    /**
     * La date de la dernière recherche web faite pour ce sujet (migration
     * 0014) : la collecte cherche d'abord les sujets jamais cherchés ou les
     * plus anciens, et ne recherche pas un sujet cherché il y a moins de
     * vingt heures. Une date lisible et déboguable, à la place d'une
     * rotation par compteur de collectes.
     */
    lastSearchedAt: timestamp("last_searched_at", { withTimezone: true }),
    /** Un sujet ne se supprime pas (des articles s'y rattachent) : il se désactive. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("watch_topics_org_label_unique").on(table.organizationId, table.label),
    unique("watch_topics_id_org_unique").on(table.id, table.organizationId),
  ]
);

/**
 * Une source suivie : un site ou un flux thématique (`kind` = source), ou
 * un concurrent nommé (`kind` = competitor) dont on suit les publications
 * publiques. Porte sa SANTÉ : dernière collecte, dernier succès, dernière
 * erreur lisible, échecs consécutifs (recul croissant), mise en sommeil
 * après 30 jours d'échecs — une source muette n'empêche jamais les autres
 * et ne perd jamais ses articles passés.
 */
export const watchSources = pgTable(
  "watch_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    label: text("label").notNull(),
    siteUrl: text("site_url").notNull(),
    /** Flux RSS/Atom, déclaré ou découvert depuis la page d'accueil ; NULL = pas de flux (recherche web restreinte au domaine). */
    feedUrl: text("feed_url"),
    /** Pays de la source (ISO 3166-1 alpha-2 : « FR », « GB », « US »), affiché avec chaque article. */
    country: text("country"),
    /** Langue des contenus (« fr », « en »). */
    lang: text("lang"),
    /** Sujet rattaché, pour une source thématique. */
    topicId: uuid("topic_id"),
    lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
    lastOkAt: timestamp("last_ok_at", { withTimezone: true }),
    /** Cause lisible du dernier échec (« délai dépassé », « 404 », « flux illisible »). */
    lastError: text("last_error"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    /** En sommeil : plus interrogée (30 jours d'échecs), toujours affichée, réveillable d'un clic. */
    asleepAt: timestamp("asleep_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("watch_sources_id_org_unique").on(table.id, table.organizationId),
    uniqueIndex("watch_sources_org_kind_site_unique").on(table.organizationId, table.kind, table.siteUrl),
    foreignKey({
      name: "watch_sources_topic_org_fk",
      columns: [table.topicId, table.organizationId],
      foreignColumns: [watchTopics.id, watchTopics.organizationId],
    }),
    check("watch_sources_kind_check", sql`${table.kind} IN ('source', 'competitor')`),
  ]
);

/**
 * Un article collecté. Pas de corps, pas d'extrait — par construction.
 * `url` est canonique (hôte en minuscules, sans paramètres de suivi, sans
 * fragment) et `url_hash` son empreinte, unique par organisation : un même
 * article vu par deux sources compte une fois.
 */
export const watchItems = pgTable(
  "watch_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** La source déclarée qui l'a apporté ; NULL pour un résultat de recherche sans source déclarée (`publisher` dit alors qui publie). */
    sourceId: uuid("source_id"),
    /** Le sujet auquel il est classé. */
    topicId: uuid("topic_id"),
    title: text("title").notNull(),
    url: text("url").notNull(),
    urlHash: text("url_hash").notNull(),
    /** Qui publie (nom ou domaine) — toujours renseigné, même sans source déclarée. */
    publisher: text("publisher").notNull(),
    /** Date de publication telle que la source la donne ; NULL = inconnue (jamais une valeur plausible). */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    country: text("country"),
    lang: text("lang"),
    /** Le résumé ORIGINAL (deux ou trois phrases), écrit par l'IA — jamais un extrait. */
    summary: text("summary"),
    /** pending (à résumer), done, refused (une suite de 12 mots de l'original détectée : refusé, jamais stocké), failed. */
    summaryState: text("summary_state").notNull().default("pending"),
    /** Le modèle qui a écrit le résumé (traçabilité). */
    summaryModel: text("summary_model"),
    /** Thèmes reconnus (libellés de sujets, ou thèmes libres pour un concurrent). */
    themes: text("themes").array().notNull().default([]),
    /** L'angle pris par l'article (surtout pour un concurrent : « ce qu'ils traitent, sous quel angle »). */
    angle: text("angle"),
    /** Par quel chemin il est arrivé : flux ou recherche. */
    discoveredVia: text("discovered_via").notNull(),
    discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull().defaultNow(),
    /** Écarté par l'utilisateur (masqué, jamais supprimé — il reviendrait à la collecte suivante). */
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("watch_items_id_org_unique").on(table.id, table.organizationId),
    uniqueIndex("watch_items_org_url_unique").on(table.organizationId, table.urlHash),
    foreignKey({
      name: "watch_items_source_org_fk",
      columns: [table.sourceId, table.organizationId],
      foreignColumns: [watchSources.id, watchSources.organizationId],
    }),
    foreignKey({
      name: "watch_items_topic_org_fk",
      columns: [table.topicId, table.organizationId],
      foreignColumns: [watchTopics.id, watchTopics.organizationId],
    }),
    // L'écran : les articles récents d'une organisation, par sujet, par source.
    index("watch_items_org_published_idx").on(table.organizationId, table.publishedAt),
    index("watch_items_org_topic_idx").on(table.organizationId, table.topicId),
    index("watch_items_org_source_idx").on(table.organizationId, table.sourceId),
    check("watch_items_summary_state_check", sql`${table.summaryState} IN ('pending', 'done', 'refused', 'failed')`),
    check("watch_items_discovered_via_check", sql`${table.discoveredVia} IN ('feed', 'search')`),
  ]
);

/** Le PANIER de l'organisation (partagé par l'équipe) : ce qu'on met de côté pour écrire. */
export const watchBasketItems = pgTable(
  "watch_basket_items",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull(),
    addedBy: uuid("added_by").references(() => users.id, { onDelete: "set null" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.itemId] }),
    foreignKey({
      name: "watch_basket_items_item_org_fk",
      columns: [table.itemId, table.organizationId],
      foreignColumns: [watchItems.id, watchItems.organizationId],
    }).onDelete("cascade"),
  ]
);

/**
 * Le journal des COLLECTES : une ligne par exécution (à la visite, bouton,
 * cron), ce qu'elle a trouvé, ce qui a échoué. Une collecte non finie
 * verrouille le départ d'une autre — GARANTI PAR LA BASE (migration 0014) :
 * l'index partiel unique n'admet qu'une ligne ouverte par organisation ;
 * une ligne ouverte depuis plus de cinq minutes (fonction coupée) est close
 * « interrompue » au départ suivant, sinon le verrou ne se lèverait jamais.
 */
export const watchRuns = pgTable(
  "watch_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    trigger: text("trigger").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    sourcesOk: integer("sources_ok").notNull().default(0),
    sourcesFailed: integer("sources_failed").notNull().default(0),
    itemsNew: integer("items_new").notNull().default(0),
    itemsSummarized: integer("items_summarized").notNull().default(0),
    /** Cause lisible si la collecte elle-même a échoué (pas une source). */
    error: text("error"),
  },
  (table) => [
    index("watch_runs_org_started_idx").on(table.organizationId, table.startedAt),
    // Une seule collecte ouverte par organisation : deux départs simultanés ne peuvent pas se croiser.
    uniqueIndex("watch_runs_org_open_unique")
      .on(table.organizationId)
      .where(sql`${table.finishedAt} IS NULL`),
    check("watch_runs_trigger_check", sql`${table.trigger} IN ('visit', 'manual', 'cron')`),
  ]
);

export type WatchTopic = typeof watchTopics.$inferSelect;
export type WatchSource = typeof watchSources.$inferSelect;
export type WatchItem = typeof watchItems.$inferSelect;
export type WatchBasketItem = typeof watchBasketItems.$inferSelect;
export type WatchRun = typeof watchRuns.$inferSelect;
