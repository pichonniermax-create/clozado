import { foreignKey, index, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { deals } from "./deals";
import { organizations } from "./organizations";
import { partners } from "./partners";
import { users } from "./users";

/**
 * Cycle de vie TECHNIQUE d'un partage — pas une valeur métier configurable
 * par organisation (contrairement aux statuts d'affaire) : c'est le
 * protocole du jeton lui-même, identique pour tout client, au même titre
 * que `user_role`.
 *
 * PAS de valeur "expired" : l'expiration n'est jamais un état stocké (voir
 * `expiresAt` ci-dessous) — un jeton expiré doit être refusé même si aucune
 * tâche de fond n'a jamais tourné pour le marquer. `revoked` reste une
 * action explicite, humaine, distincte de l'écoulement du temps.
 */
export const dealShareStatusEnum = pgEnum("deal_share_status", [
  "pending",
  "accepted",
  "declined",
  "revoked",
]);

/**
 * LE point le plus sensible du produit : la seule table qui fait sortir une
 * donnée d'une organisation vers un tiers sans compte.
 *
 * - `tokenHash` : jamais le jeton en clair en base. Le jeton (256 bits
 *   d'aléa, généré côté application, jamais dérivé d'un id) n'est montré
 *   qu'UNE FOIS à la création, à charge pour l'admin de le copier — seule
 *   son empreinte SHA-256 est stockée, sur le même principe qu'un mot de
 *   passe. Un dump de la base ne donne accès à aucun partage actif.
 *   "Renvoyer le lien" génère un NOUVEAU partage (nouveau jeton) et révoque
 *   l'ancien — jamais un jeton existant réaffiché.
 * - `organizationId` est dénormalisé ici (déjà déductible via `dealId` ou
 *   `partnerId`) et son exactitude est GARANTIE PAR LA BASE, pas par
 *   convention : les deux FK composites ci-dessous forcent
 *   `organizationId` à être simultanément celui de l'affaire ET celui du
 *   partenaire référencés. Une tentative d'insertion incohérente est
 *   rejetée par Postgres, pas seulement évitée par discipline de code.
 * - Aucune fonction touchant cette table depuis la route publique ne doit
 *   jamais recevoir un `organizationId` ou une session utilisateur — voir
 *   le futur `src/db/queries/deal-shares-public.ts`, seule exception à
 *   `orgScope` du produit.
 */
export const dealShares = pgTable(
  "deal_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id").notNull(),
    partnerId: uuid("partner_id").notNull(),
    /** SHA-256 hexadécimal du jeton — jamais le jeton en clair. Unique : clé de recherche de la route publique. */
    tokenHash: text("token_hash").notNull().unique(),
    status: dealShareStatusEnum("status").notNull().default("pending"),
    /** Conditions de commission proposées au partenaire, en texte libre (le détail chiffré vit dans `commissions`). */
    proposedTerms: text("proposed_terms"),
    /** Message d'accompagnement du partage, visible par le partenaire. */
    message: text("message"),
    /**
     * NULL = pas d'expiration. Choisi à la création de CE partage (pas un
     * réglage global). ÉVALUÉE À CHAQUE ACCÈS par le code de la route
     * publique (`expiresAt !== null && expiresAt < now()`) — jamais
     * matérialisée dans `status`, jamais dépendante d'une tâche de fond.
     */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /**
     * « Renvoyer le lien » révoque un partage et en crée un nouveau : cette
     * colonne relie le nouveau à celui qu'il remplace. Pour l'analytique,
     * une chaîne de renvois est UN partage, envoyé à la date du premier —
     * les remplacés ne comptent ni comme sans réponse ni comme refusés.
     * NULL = premier envoi. Posée depuis le module analytique (étape 2) ;
     * les renvois antérieurs restent sans lien (aucun en base à ce moment).
     */
    replacesShareId: uuid("replaces_share_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Cible des FK composites de commissions et deal_events.
    unique("deal_shares_id_org_unique").on(table.id, table.organizationId),
    // L'invariant de sécurité central de toute la table, garanti par Postgres :
    foreignKey({
      name: "deal_shares_deal_org_fk",
      columns: [table.dealId, table.organizationId],
      foreignColumns: [deals.id, deals.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "deal_shares_partner_org_fk",
      columns: [table.partnerId, table.organizationId],
      foreignColumns: [partners.id, partners.organizationId],
    }).onDelete("cascade"),
    // Un partage ne peut remplacer qu'un partage de sa propre organisation.
    foreignKey({
      name: "deal_shares_replaces_org_fk",
      columns: [table.replacesShareId, table.organizationId],
      foreignColumns: [table.id, table.organizationId],
    }),
    // Analytique : par partenaire dans le temps, et par état (suivi).
    index("deal_shares_org_partner_sent_idx").on(table.organizationId, table.partnerId, table.sentAt),
    index("deal_shares_org_status_idx").on(table.organizationId, table.status),
  ]
);

export type DealShare = typeof dealShares.$inferSelect;
export type NewDealShare = typeof dealShares.$inferInsert;
