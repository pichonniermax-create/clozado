import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { organizations } from "./organizations";
import { signatories } from "./signatories";

/**
 * Une CIBLE de newsletter, rattachée à une organisation. VOLONTAIREMENT des
 * lignes de table et non un type Postgres figé : une organisation doit
 * pouvoir avoir 2 cibles, 6, ou en renommer une, sans migration de schéma
 * (§7.2 du dossier de reconstruction — l'erreur la plus coûteuse du projet
 * d'origine était un enum "NL1|NL2|NL3" en dur).
 *
 * Depuis le chantier « ciblage et contenu » (docs/module-ciblage-contenu.md),
 * une cible a DEUX natures à la fois :
 * - un SEGMENT VIVANT sur les contacts (`kind` = segment, `criteria` = les
 *   critères, recalculés à chaque consultation, jamais une liste figée) ou
 *   une sélection manuelle (`kind` = static, membres dans
 *   `mail_target_members`) ;
 * - une IDENTITÉ ÉDITORIALE en six facettes (`persona` : qui est cette
 *   personne ; `concerns` : ce qui la préoccupe ; `knowledge_level` : son
 *   niveau de connaissance ; `editorial_voice` : le ton et la voix à
 *   adopter ; `interests` : ce qui l'intéresse ; `avoid` : CE QU'ON NE LUI
 *   DIT PAS) — composées dans le prompt de génération, jamais en dur.
 * Une cible ne se supprime pas : elle se désactive (`archived_at`), pour
 * que l'historique des newsletters qui la référencent reste juste.
 */
export const mailTargets = pgTable(
  "mail_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Clé stable par organisation (ex: "decouverte"), pas de sens global. */
    slug: text("slug").notNull(),
    label: text("label").notNull(),
    persona: text("persona"),
    /** Texte libre (ex: "B2C"), volontairement pas un enum : vocabulaire du client. */
    audienceLabel: text("audience_label"),
    /**
     * Nature : « segment » (critères recalculés) ou « static » (sélection
     * manuelle dans `mail_target_members`). Protocole technique fixe, validé
     * par une contrainte CHECK et par le code — pas une valeur métier.
     */
    kind: text("kind").notNull().default("segment"),
    /**
     * Les critères du segment, en JSON validé par le code (zod) et compilé en
     * SQL par UNE fonction — `{}` = tous les contacts vivants de
     * l'organisation. Vide pour une cible statique.
     */
    criteria: jsonb("criteria").notNull().default({}),
    /** À quoi sert cette cible, pour l'équipe (jamais dans le prompt). */
    description: text("description"),
    /** Ce qui préoccupe cette personne (facette de l'identité éditoriale). */
    concerns: text("concerns"),
    /** Son niveau de connaissance du sujet. */
    knowledgeLevel: text("knowledge_level"),
    /**
     * Le ton et la voix à adopter — la facette historique de l'identité
     * éditoriale (colonne conservée, devenue facultative : une cible peut
     * naître de ses critères et recevoir son identité ensuite).
     */
    editorialVoice: text("editorial_voice"),
    /** Ce qui l'intéresse. */
    interests: text("interests"),
    /** CE QU'ON NE LUI DIT PAS — la facette qui fait un email adressé. */
    avoid: text("avoid"),
    /** Désactivation : la cible disparaît des choix, jamais de l'historique. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    /** Accent UI de la carte cible dans le composer, en hexadécimal. */
    accentColor: text("accent_color"),
    defaultSignatoryId: uuid("default_signatory_id").references(() => signatories.id, {
      onDelete: "set null",
    }),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("mail_targets_org_slug_unique").on(table.organizationId, table.slug),
    // Cible des FK composites (membres, destinataires) : une ligne fille ne
    // peut jamais référencer la cible d'une autre organisation.
    unique("mail_targets_id_org_unique").on(table.id, table.organizationId),
    check("mail_targets_kind_check", sql`${table.kind} IN ('segment', 'static')`),
  ]
);

/**
 * Les membres d'une cible STATIQUE (sélection manuelle, quand le critère
 * n'est pas exprimable). `organization_id` dénormalisé et garanti par les
 * deux FK composites : impossible de mettre le contact d'une organisation
 * dans la cible d'une autre.
 */
export const mailTargetMembers = pgTable(
  "mail_target_members",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    targetId: uuid("target_id").notNull(),
    contactId: uuid("contact_id").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.targetId, table.contactId] }),
    foreignKey({
      name: "mail_target_members_target_org_fk",
      columns: [table.targetId, table.organizationId],
      foreignColumns: [mailTargets.id, mailTargets.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "mail_target_members_contact_org_fk",
      columns: [table.contactId, table.organizationId],
      foreignColumns: [contacts.id, contacts.organizationId],
    }).onDelete("cascade"),
    // La fiche contact : « de quelles cibles ce contact fait partie ».
    index("mail_target_members_org_contact_idx").on(table.organizationId, table.contactId),
  ]
);

export type MailTarget = typeof mailTargets.$inferSelect;
export type NewMailTarget = typeof mailTargets.$inferInsert;
export type MailTargetMember = typeof mailTargetMembers.$inferSelect;
