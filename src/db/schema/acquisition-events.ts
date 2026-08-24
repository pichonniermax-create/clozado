import { foreignKey, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { origins } from "./origins";

/** Les trois pas du funnel amont — protocole technique fixe, pas un vocabulaire client. */
export const acquisitionEventKindEnum = pgEnum("acquisition_event_kind", [
  "visit",
  "simulation_started",
  "simulation_completed",
]);

/**
 * Ce qui se passe sur les sites et simulateurs des clients AVANT qu'une
 * personne existe : une visite, une simulation démarrée, terminée. Reçu par
 * `POST /api/events` depuis le navigateur (identification de
 * l'organisation par sa `site_key` publique + domaine d'origine autorisé,
 * débit limité) — anonyme : un `visitor_id` posé par l'extrait JavaScript
 * chez le client, jamais d'adresse IP, jamais d'identité. C'est le lead
 * qui, portant le même `visitor_id`, relie ensuite la chaîne à une
 * personne. Une visite non collectée est perdue : rien ne se reconstruit.
 */
export const acquisitionEvents = pgTable(
  "acquisition_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: acquisitionEventKindEnum("kind").notNull(),
    /** Identifiant anonyme du navigateur, généré côté site (première partie), stable dans le temps. */
    visitorId: text("visitor_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    pageUrl: text("page_url"),
    referrer: text("referrer"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    /** Le simulateur concerné (texte libre transmis par le site). */
    simulator: text("simulator"),
    /** Origine rattachée à une ligne configurée — ou NULL, avec le texte en débordement. */
    originId: uuid("origin_id"),
    originRaw: text("origin_raw"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "acquisition_events_origin_org_fk",
      columns: [table.originId, table.organizationId],
      foreignColumns: [origins.id, origins.organizationId],
    }).onDelete("set null"),
    index("acquisition_events_org_visitor_idx").on(table.organizationId, table.visitorId, table.occurredAt),
    index("acquisition_events_org_kind_occurred_idx").on(table.organizationId, table.kind, table.occurredAt),
    index("acquisition_events_org_origin_idx").on(table.organizationId, table.originId),
  ]
);

export type AcquisitionEvent = typeof acquisitionEvents.$inferSelect;
