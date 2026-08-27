import { sql } from "drizzle-orm";
import { check, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

/**
 * super_admin : moi, je vois toutes les organisations (n'est rattaché à aucune en particulier).
 * admin       : gère son organisation.
 * member      : utilisateur simple au sein d'une organisation.
 */
export const userRoleEnum = pgEnum("user_role", ["super_admin", "admin", "member"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    name: text("name"),
    image: text("image"),
    /** Rempli par Auth.js quand l'adresse email est confirmée. */
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    role: userRoleEnum("role").notNull().default("member"),
    /** Obligatoire pour admin/member, toujours NULL pour super_admin (voir contrainte ci-dessous). */
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    /** La langue de l'interface choisie par la personne (« fr », « en ») ; NULL = la langue par défaut de son organisation (migration 0015). */
    locale: text("locale"),
    /** L'adresse de réponse de la personne (chantier engagement) ; NULL = celle de l'organisation (`sender_email`). */
    replyToEmail: text("reply_to_email"),
    /** Son lien de prise de rendez-vous (Calendly…), insérable dans les emails et les gabarits. */
    bookingUrl: text("booking_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Verrou d'isolation au niveau de la base : un super_admin n'a jamais
    // d'organisation, un admin/member en a toujours une.
    check(
      "users_role_organization_consistency",
      sql`(${table.role} = 'super_admin' AND ${table.organizationId} IS NULL)
        OR (${table.role} <> 'super_admin' AND ${table.organizationId} IS NOT NULL)`
    ),
  ]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
