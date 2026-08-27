import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * ORIGINE du contact — figée à la création, ne change jamais ensuite :
 * saisi à la main, arrivé par un import CSV, né dans un système externe, ou
 * arrivé par un lead (simulateur, page — module analytique).
 * Protocole technique fixe (comme `deal_share_status`), pas une valeur
 * métier configurable. Un contact `manual`/`import` peut être RATTACHÉ plus
 * tard à un CRM externe (external_system/external_id posés par une future
 * synchro) sans que son origine change.
 */
export const contactSourceEnum = pgEnum("contact_source", ["manual", "import", "external", "lead"]);

/** Personne physique ou personne morale — conditionne la fiche, pas un vocabulaire client. */
export const contactKindEnum = pgEnum("contact_kind", ["person", "company"]);

/**
 * Le cœur relationnel du produit. Règles structurantes :
 *
 * - ISOLATION : `organization_id` partout, FK composites vers cette table
 *   via `contacts_id_org_unique` — même invariant que `deals`.
 * - DONNÉES PERSONNELLES : la liste de champs est FERMÉE et justifiée dans
 *   docs/module-relationnel.md §C — aucun champ « au cas où », aucun champ
 *   financier (les montants vivent sur les affaires), aucune donnée
 *   sensible au sens réglementaire, et pas d'autre texte libre que `notes`.
 * - SUPPRESSION = PIERRE TOMBALE : la ligne survit anonymisée
 *   (`deleted_at` posé, identité à NULL, `name` → « Contact supprimé »),
 *   les affaires restent reliées. Jamais de DELETE physique d'un contact.
 * - SYNCHRO CRM (non construite, anticipée) : règle de conflit écrite dans
 *   docs/module-relationnel.md §B — le système externe prime sur
 *   l'identité/coordonnées, ce qui naît ici n'est jamais écrasé, une
 *   modification locale postérieure à `last_synced_at` bloque tout
 *   écrasement silencieux.
 */
export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: contactKindEnum("kind").notNull().default("person"),
    /** Nom d'affichage : nom complet (personne) ou raison sociale (morale). Recherche + tri. */
    name: text("name").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    email: text("email"),
    phone: text("phone"),
    /** Société en texte libre — ce qu'apporte un CSV. Le lien structuré `company_id` prime à l'affichage quand il existe. */
    companyName: text("company_name"),
    /** Lien vers la fiche personne morale (même table). */
    companyId: uuid("company_id"),
    jobTitle: text("job_title"),
    city: text("city"),
    postalCode: text("postal_code"),
    country: text("country"),
    /** Le conseil patrimonial est structuré par l'âge (retraite, horizon) — usage validé, cf. doc §C. */
    birthDate: date("birth_date"),
    notes: text("notes"),
    /** Conseiller de l'organisation à qui la fiche est attribuée. */
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    source: contactSourceEnum("source").notNull().default("manual"),
    /** Nom du système d'origine (« hubspot », « pipedrive »…) — texte libre, on ne connaît pas la liste du marché. */
    externalSystem: text("external_system"),
    /** Identifiant du contact DANS le système d'origine. */
    externalId: text("external_id"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    /** Pierre tombale : posé à la suppression, jamais retiré. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    /**
     * L'arrêt des envois automatiques (chantier engagement) : posé dès que
     * le contact répond ou prend rendez-vous — réarmable explicitement par
     * une personne, journalisé. La raison (`replied`, `appointment`,
     * `manual`) est affichée. La DÉSINSCRIPTION n'est PAS ici : elle vit
     * dans `email_suppressions`, par adresse, sans aucun chemin de retour
     * (obligation légale — un déclencheur Postgres interdit même de
     * supprimer la ligne, migration 0016).
     */
    autoSendStoppedAt: timestamp("auto_send_stopped_at", { withTimezone: true }),
    autoSendStopReason: text("auto_send_stop_reason"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Cible des FK composites (deals, tâches, activités, étiquettes, journal
    // des accès) : une ligne fille ne peut jamais référencer le contact
    // d'une autre organisation.
    unique("contacts_id_org_unique").on(table.id, table.organizationId),
    // Auto-référence société ↔ salarié, verrouillée à la même organisation.
    // Pas de ON DELETE : les contacts ne se suppriment jamais physiquement
    // (pierre tombale) ; seule la suppression en cascade de l'organisation
    // emporte tout d'un même geste.
    foreignKey({
      name: "contacts_company_org_fk",
      columns: [table.companyId, table.organizationId],
      foreignColumns: [table.id, table.organizationId],
    }),
    // Identifiant externe : les deux champs vivent ensemble ou pas du tout.
    check(
      "contacts_external_pair",
      sql`(${table.externalSystem} IS NULL) = (${table.externalId} IS NULL)`
    ),
    // Né dans un système externe ⇒ on sait lequel et sous quel identifiant.
    check(
      "contacts_external_source_consistency",
      sql`${table.source} <> 'external' OR ${table.externalSystem} IS NOT NULL`
    ),
    // Une personne morale ne porte aucun champ de personne physique.
    check(
      "contacts_company_fields_consistency",
      sql`${table.kind} = 'person'
        OR (${table.firstName} IS NULL AND ${table.lastName} IS NULL AND ${table.birthDate} IS NULL
            AND ${table.companyId} IS NULL AND ${table.companyName} IS NULL AND ${table.jobTitle} IS NULL)`
    ),
    // L'arrêt des envois automatiques porte toujours sa raison, et une raison connue.
    check(
      "contacts_auto_send_stop_pair",
      sql`(${table.autoSendStoppedAt} IS NULL) = (${table.autoSendStopReason} IS NULL)`
    ),
    check(
      "contacts_auto_send_stop_reason_check",
      sql`${table.autoSendStopReason} IS NULL OR ${table.autoSendStopReason} IN ('replied', 'appointment', 'manual')`
    ),
    // Jamais deux fiches locales pour le même enregistrement distant.
    uniqueIndex("contacts_org_external_unique")
      .on(table.organizationId, table.externalSystem, table.externalId)
      .where(sql`${table.externalSystem} IS NOT NULL`),
    // Tri/pagination de la liste (les fiches vivantes seulement).
    index("contacts_org_name_idx")
      .on(table.organizationId, table.name)
      .where(sql`${table.deletedAt} IS NULL`),
    // Filtre « mes contacts » (par conseiller).
    index("contacts_org_owner_idx").on(table.organizationId, table.ownerId),
    // Analytique : arrivées de contacts dans le temps.
    index("contacts_org_created_idx").on(table.organizationId, table.createdAt),
  ]
);

export type Contact = typeof contacts.$inferSelect;
export type NewContact = typeof contacts.$inferInsert;
