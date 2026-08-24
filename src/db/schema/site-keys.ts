import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

/**
 * Les clés de SITE d'une organisation — l'identifiant public que l'extrait
 * JavaScript posé sur ses sites transmet à `POST /api/events`. Publique par
 * construction (elle vit dans le HTML des clients), donc pas un secret ;
 * mais elle doit pouvoir TOURNER sans casser les installations : plusieurs
 * clés actives en parallèle, une révocation datée. Une clé abusée se
 * révoque pendant que la nouvelle est déjà posée. L'organisation existe
 * avec une clé dès sa création (migration : une par organisation
 * existante ; inscription : dans le même lot).
 */
export const siteKeys = pgTable(
  "site_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** 32 caractères hexadécimaux, opaque, ne révèle pas l'id interne. */
    key: text("key").notNull().unique(),
    /** Où elle est posée (« Site vitrine », « Simulateur crédit ») — choisi par l'organisation. */
    label: text("label").notNull().default("Site principal"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Révoquée = refusée par /api/events ; conservée pour l'historique. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [index("site_keys_org_idx").on(table.organizationId)]
);

export type SiteKey = typeof siteKeys.$inferSelect;
