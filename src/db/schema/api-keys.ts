import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * Les clés d'API d'une organisation — ce qui authentifie `POST /api/leads`
 * (serveur à serveur uniquement, jamais dans du JavaScript côté
 * navigateur). Même discipline que le jeton de partage : 256 bits d'aléa,
 * montrée UNE fois à la création, seule son empreinte SHA-256 est stockée ;
 * un dump de la base ne donne accès à aucune clé. Plusieurs clés peuvent
 * vivre en parallèle (une par intégration), ce qui permet la rotation sans
 * coupure : on crée la nouvelle, on bascule l'intégration, on révoque
 * l'ancienne — `last_used_at` dit si elle sert encore.
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** À quoi sert cette clé (« Simulateur crédit — serveur ») — libellé choisi par l'organisation. */
    label: text("label").notNull(),
    /** Les premiers caractères de la clé, pour la reconnaître dans la liste — jamais assez pour la reconstituer. */
    keyPrefix: text("key_prefix").notNull(),
    /** SHA-256 hexadécimal de la clé — jamais la clé en clair. Unique : clé de recherche à l'authentification. */
    keyHash: text("key_hash").notNull().unique(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Dernière authentification réussie — pour savoir si une clé sert encore avant de la révoquer. */
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    /** Révoquée = refusée à l'authentification, conservée pour l'historique (les leads reçus y restent liés). */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [index("api_keys_org_idx").on(table.organizationId)]
);

export type ApiKey = typeof apiKeys.$inferSelect;
