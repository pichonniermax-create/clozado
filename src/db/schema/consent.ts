import { sql } from "drizzle-orm";
import { check, foreignKey, index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * LA BASE LÉGALE, CONTACT PAR CONTACT (chantier envoi, garde-fous).
 *
 * Un booléen « opt-in » ne suffit ni au droit ni à l'état de l'art : ce
 * qu'il faut pouvoir montrer, c'est QUI a autorisé, QUAND, COMMENT, et
 * SOUS QUEL TEXTE (docs/audit-newsletter.md §C.3). D'où deux tables :
 *
 * - `consent_events` — un JOURNAL, jamais modifié : chaque geste qui change
 *   l'autorisation d'un contact (inscription, confirmation en double
 *   opt-in, import déclaré, saisie à la main, désinscription, plainte,
 *   opposition) avec sa date, sa source, sa preuve. C'est lui la vérité.
 * - `consent_texts` — les textes de consentement PRÉSENTÉS, figés par
 *   version : un formulaire qu'on réécrit ne doit pas réécrire ce que les
 *   gens ont accepté l'an dernier.
 *
 * Le statut COURANT est recopié sur la fiche (`contacts.email_consent_*`)
 * pour que la vague et les cibles le lisent sans rejouer le journal — un
 * cache, jamais la source.
 */

/** Les statuts d'autorisation, du plus permissif au plus fermé. */
export const CONSENT_STATUSES = ["granted", "client", "professional", "not_established", "objected"] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

/** D'où vient le geste. `system` couvre ce que le produit constate (rebond, plainte). */
export const CONSENT_SOURCES = [
  "site_form",
  "double_opt_in",
  "import",
  "manual",
  "ingestion",
  "appointment",
  "deal_won",
  "unsubscribe",
  "complaint",
] as const;

export const consentTexts = pgTable(
  "consent_texts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Où ce texte est présenté : le formulaire du site, la page de réservation, l'email de re-consentement. */
    kind: text("kind").notNull(),
    /** Le texte exact, tel qu'il a été montré. */
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("consent_texts_kind_check", sql`${table.kind} IN ('site_form', 'booking', 'reconsent')`),
    // Cible des clés composites : un texte ne peut être cité que par son organisation.
    unique("consent_texts_id_org_unique").on(table.id, table.organizationId),
    index("consent_texts_org_kind_idx").on(table.organizationId, table.kind, table.createdAt),
  ]
);

export const consentEvents = pgTable(
  "consent_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /**
     * La fiche concernée. Elle peut disparaître (pierre tombale, fusion) :
     * la clé est alors mise à NULL et la ligne RESTE — une preuve
     * d'autorisation qui s'efface avec la fiche ne prouve plus rien.
     */
    contactId: uuid("contact_id"),
    /** L'adresse au moment du geste, en minuscules : la preuve survit au changement d'adresse. */
    email: text("email"),
    channel: text("channel").notNull().default("email"),
    status: text("status").notNull(),
    /** La base légale invoquée, en clair (« consentement », « client, sujet analogue », « intérêt légitime B2B »). */
    basis: text("basis"),
    source: text("source").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    /** La personne qui a consigné le geste ; NULL quand c'est le produit qui l'a constaté. */
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    /** La version de texte présentée, quand il y en avait une. */
    consentTextId: uuid("consent_text_id"),
    /**
     * De quoi retrouver la preuve : identifiant de formulaire, nom du
     * fichier importé et du cédant, référence d'affaire, identifiant du
     * message. JAMAIS une adresse IP — elle n'est pas nécessaire ici.
     */
    evidence: jsonb("evidence"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("consent_events_status_check", sql`${table.status} IN ('granted', 'client', 'professional', 'not_established', 'objected')`),
    check("consent_events_channel_check", sql`${table.channel} IN ('email', 'phone')`),
    check(
      "consent_events_source_check",
      sql`${table.source} IN ('site_form', 'double_opt_in', 'import', 'manual', 'ingestion', 'appointment', 'deal_won', 'unsubscribe', 'complaint')`
    ),
    foreignKey({
      name: "consent_events_contact_org_fk",
      columns: [table.contactId, table.organizationId],
      foreignColumns: [contacts.id, contacts.organizationId],
    }).onDelete("set null"),
    foreignKey({
      name: "consent_events_text_org_fk",
      columns: [table.consentTextId, table.organizationId],
      foreignColumns: [consentTexts.id, consentTexts.organizationId],
    }).onDelete("set null"),
    index("consent_events_org_contact_idx").on(table.organizationId, table.contactId, table.occurredAt),
    index("consent_events_org_email_idx").on(table.organizationId, table.email),
  ]
);

export type ConsentEvent = typeof consentEvents.$inferSelect;
export type NewConsentEvent = typeof consentEvents.$inferInsert;
export type ConsentText = typeof consentTexts.$inferSelect;
