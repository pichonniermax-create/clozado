import { boolean, foreignKey, index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { apiKeys } from "./api-keys";
import { contacts } from "./contacts";
import { organizations } from "./organizations";
import { origins } from "./origins";

/**
 * Une ARRIVÉE — le moment où une personne se manifeste par un simulateur
 * ou une page, reçue par `POST /api/leads` (serveur à serveur, clé d'API).
 * Le lead ne remplace pas le contact : il crée ou complète la fiche
 * (`contact_id`, même règle que l'import : email connu ⇒ compléter, jamais
 * écraser — `matched_existing_contact` et `enriched_fields` gardent la
 * trace de l'enrichissement, que le journal unifié affiche). Un contact
 * peut avoir plusieurs leads ; le premier fait foi pour « lead → premier
 * contact effectif ». L'origine se figera sur l'affaire (`deals.lead_id`) :
 * c'est ce qui permet de répondre « quelle origine génère des affaires qui
 * se signent ».
 *
 * L'ATTRIBUTION SURVIT À LA PERSONNE. À la suppression d'un contact
 * (pierre tombale), le lead reste, rattaché à la tombale comme les
 * affaires, et garde tout ce qui parle du site et non de la personne :
 * date d'arrivée, origine, simulateur, page, referrer, UTM, dates de
 * simulation, clé utilisée, champs enrichis. Sont PURGÉS : `payload` (les
 * réponses de la simulation) et `visitor_id` (le lien vers son
 * comportement de navigation). `contact_id` est nullable et passe à NULL
 * si la fiche disparaissait physiquement : jamais de cascade qui
 * emporterait l'origine.
 */
export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id"),
    /** La clé qui a authentifié l'envoi — conservée même révoquée (historique). */
    apiKeyId: uuid("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
    /** Le même identifiant anonyme que les événements de visite : c'est lui qui relie la chaîne. */
    visitorId: text("visitor_id"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    simulator: text("simulator"),
    pageUrl: text("page_url"),
    referrer: text("referrer"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    originId: uuid("origin_id"),
    originRaw: text("origin_raw"),
    /** Transmis par le simulateur — les dates qui font foi pour « simulation démarrée / terminée ». */
    simulationStartedAt: timestamp("simulation_started_at", { withTimezone: true }),
    simulationCompletedAt: timestamp("simulation_completed_at", { withTimezone: true }),
    /** Les réponses de la simulation, telles quelles — jamais interprétées par le produit, jamais de donnée sensible attendue. */
    payload: jsonb("payload"),
    /** Vrai si l'email correspondait à une fiche existante, complétée plutôt que doublonnée. */
    matchedExistingContact: boolean("matched_existing_contact").notNull().default(false),
    /** Les champs de la fiche remplis par ce lead (journal de l'enrichissement). */
    enrichedFields: text("enriched_fields").array().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Cible de la FK composite deals(lead_id, organization_id).
    unique("leads_id_org_unique").on(table.id, table.organizationId),
    foreignKey({
      name: "leads_contact_org_fk",
      columns: [table.contactId, table.organizationId],
      foreignColumns: [contacts.id, contacts.organizationId],
    }).onDelete("set null"),
    foreignKey({
      name: "leads_origin_org_fk",
      columns: [table.originId, table.organizationId],
      foreignColumns: [origins.id, origins.organizationId],
    }).onDelete("set null"),
    index("leads_org_received_idx").on(table.organizationId, table.receivedAt),
    index("leads_org_contact_idx").on(table.organizationId, table.contactId),
    index("leads_org_visitor_idx").on(table.organizationId, table.visitorId),
    index("leads_org_origin_idx").on(table.organizationId, table.originId),
  ]
);

export type Lead = typeof leads.$inferSelect;
