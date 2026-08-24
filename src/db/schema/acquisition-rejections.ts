import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

/**
 * Ce que la collecte a REFUSÉ, compté par organisation, motif et détail
 * (le domaine refusé, le préfixe de la clé révoquée…). Sans cela, une
 * organisation mal configurée (domaine non déclaré) collecterait zéro en
 * silence ; les réglages montrent ces compteurs et disent quoi corriger.
 * Un compteur par (organisation, motif, détail), incrémenté — jamais une
 * ligne par requête refusée : une attaque ne remplit pas la table.
 */
export const acquisitionRejections = pgTable(
  "acquisition_rejections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** `domain_not_allowed`, `origin_missing`, `site_key_revoked`, `api_key_revoked`, `rate_limited`, `payload_too_large`, `invalid_payload`. */
    reason: text("reason").notNull(),
    /** Le domaine, le préfixe de clé, ou « (absent) ». */
    detail: text("detail").notNull(),
    count: integer("count").notNull().default(1),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("acquisition_rejections_org_reason_detail_unique").on(
      table.organizationId,
      table.reason,
      table.detail
    ),
  ]
);

export type AcquisitionRejection = typeof acquisitionRejections.$inferSelect;
