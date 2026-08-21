import { sql } from "drizzle-orm";
import { check, foreignKey, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { dealShares } from "./deal-shares";
import { deals } from "./deals";
import { organizations } from "./organizations";
import { partners } from "./partners";
import { users } from "./users";

/**
 * Vocabulaire technique fixe du journal — pas une valeur métier configurable
 * par organisation. `share_expired` reste dans cette liste : ce n'est PAS
 * un état stocké sur `deal_shares.status` (voir deal-shares.ts), juste la
 * trace journalisée d'une tentative d'accès constatée expirée au moment de
 * la requête — un fait historique, pas une source de vérité sur l'état
 * courant du partage.
 */
export const dealEventTypeEnum = pgEnum("deal_event_type", [
  "deal_created",
  "share_sent",
  "share_viewed",
  "share_accepted",
  "share_declined",
  "share_revoked",
  "share_expired",
  "status_changed",
  "commented",
  "commission_updated",
]);

/**
 * Journal d'événements — la valeur du produit. Chaque changement horodaté
 * et attribué, jamais anonyme : soit un utilisateur interne
 * (`actorUserId`), soit le partenaire via son jeton (`actorPartnerId`),
 * jamais les deux à la fois (contrainte ci-dessous). Les deux peuvent être
 * NULL pour un événement système (ex: expiration constatée hors action
 * humaine).
 */
export const dealEvents = pgTable(
  "deal_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    dealId: uuid("deal_id").notNull(),
    shareId: uuid("share_id"),
    type: dealEventTypeEnum("type").notNull(),
    message: text("message"),
    /**
     * Pas de FK composite ici (contrairement à actorPartnerId ci-dessous) :
     * un super_admin (`users.organization_id IS NULL`) doit pouvoir
     * apparaître comme acteur sur l'événement d'une organisation qui n'est
     * pas "la sienne" — il n'en a aucune. Un FK composite casserait ce cas
     * légitime. Simple FK vers users.id.
     */
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorPartnerId: uuid("actor_partner_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "deal_events_single_actor",
      sql`NOT (${table.actorUserId} IS NOT NULL AND ${table.actorPartnerId} IS NOT NULL)`
    ),
    // dealId et shareId en CASCADE (jamais SET NULL) : organizationId est
    // NOT NULL sur cette table, et un SET NULL composite mettrait TOUTES
    // les colonnes de la FK à NULL — y compris organizationId, ce qui
    // violerait sa contrainte NOT NULL. Sans conséquence en pratique : une
    // affaire/un partage ne sont jamais supprimés indépendamment (les
    // partages ne se révoquent, ne se suppriment pas).
    foreignKey({
      name: "deal_events_deal_org_fk",
      columns: [table.dealId, table.organizationId],
      foreignColumns: [deals.id, deals.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "deal_events_share_org_fk",
      columns: [table.shareId, table.organizationId],
      foreignColumns: [dealShares.id, dealShares.organizationId],
    }).onDelete("cascade"),
    // Un partenaire ne peut être acteur que sur le journal de SA propre
    // organisation. Pas de ON DELETE : les partenaires se désactivent
    // (`active = false`), ne se suppriment pas — cohérent avec un journal
    // qui n'efface jamais son historique.
    foreignKey({
      name: "deal_events_actor_partner_org_fk",
      columns: [table.actorPartnerId, table.organizationId],
      foreignColumns: [partners.id, partners.organizationId],
    }),
  ]
);

export type DealEvent = typeof dealEvents.$inferSelect;
export type NewDealEvent = typeof dealEvents.$inferInsert;
