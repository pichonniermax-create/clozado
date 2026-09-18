import { boolean, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * Un partenaire est une FICHE, jamais un utilisateur : pas de compte, pas
 * de session, n'appartient à aucune organisation du produit — seulement une
 * ligne dans l'organisation qui le référence. Son seul accès à une donnée
 * passe par un jeton de partage (deal_shares.token_hash), jamais par une
 * connexion (point le plus sensible du module PRM).
 */
export const partners = pgTable(
  "partners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    company: text("company"),
    /** Texte libre (ex: "CGP", "Courtier crédit") — pas une liste figée, vocabulaire du client. */
    profession: text("profession"),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes"),
    /**
     * Le conseiller qui tient la RELATION avec ce confrère (lot 3) — pas le
     * propriétaire d'une fiche : la personne à qui l'on demande « où en
     * es-tu avec lui ». Sans contrainte de paire avec une date : la clé est
     * en `set null`, et un compte supprimé ne doit pas bloquer.
     */
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Cible de la FK composite de deal_shares (partnerId, organizationId) et
    // de deal_events (actorPartnerId, organizationId) — garantit par la
    // base qu'un partenaire référencé appartient bien à l'organisation
    // portée par la ligne qui le référence.
    unique("partners_id_org_unique").on(table.id, table.organizationId),
    // « Les confrères dont je tiens la relation » : le filtre et la vue par conseiller du lot 3.
    index("partners_org_owner_idx").on(table.organizationId, table.ownerId),
  ]
);

export type Partner = typeof partners.$inferSelect;
export type NewPartner = typeof partners.$inferInsert;
