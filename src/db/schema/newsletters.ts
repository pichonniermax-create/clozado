import { foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { mailTargets } from "./mail-targets";
import { organizations } from "./organizations";
import { users } from "./users";
import { watchItems } from "./watch";

/**
 * Une newsletter est un BROUILLON jusqu'à « Marquer comme envoyée » : l'outil
 * n'envoie rien (l'envoi effectif est hors périmètre), c'est un geste manuel
 * daté. C'est le seul moment où l'audience est figée : les membres de la
 * cible à cet instant vont dans `newsletter_recipients`, et les critères
 * tels qu'ils étaient dans `audience_snapshot`. Une cible est vivante, un
 * envoi est un fait — l'historique ne se recalcule jamais depuis des
 * critères vivants (docs/module-ciblage-contenu.md §1.3).
 */
export const newsletters = pgTable("newsletters", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Sans titre"),
  targetId: uuid("target_id")
    .notNull()
    .references(() => mailTargets.id),
  subject: text("subject"),
  preheader: text("preheader"),
  /** Brief saisi, réutilisé par "Concevoir avec l'IA". */
  brief: text("brief"),
  /** Les sujets traités (déclarés par la génération, modifiables) — ce que l'anti-répétition montre. */
  topics: text("topics").array().notNull().default([]),
  /** Marquée comme envoyée à cette date (déclarée, modifiable) ; NULL = brouillon. */
  sentAt: timestamp("sent_at", { withTimezone: true }),
  sentMarkedBy: uuid("sent_marked_by").references(() => users.id, { onDelete: "set null" }),
  /** La photographie de l'audience au moment du marquage : libellé et nature de la cible, critères, nombre. */
  audienceSnapshot: jsonb("audience_snapshot"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // Cible des FK composites (destinataires, sources utilisées).
  unique("newsletters_id_org_unique").on(table.id, table.organizationId),
  // L'anti-répétition et l'historique : les envois récents d'une organisation.
  index("newsletters_org_sent_idx").on(table.organizationId, table.sentAt),
]);

/**
 * Les DESTINATAIRES d'une newsletter marquée envoyée : la cible évaluée à
 * cet instant, contact par contact. Un contact supprimé (pierre tombale)
 * garde ses lignes, comme ses affaires : le nombre reste juste.
 */
export const newsletterRecipients = pgTable(
  "newsletter_recipients",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    newsletterId: uuid("newsletter_id").notNull(),
    contactId: uuid("contact_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.newsletterId, table.contactId] }),
    foreignKey({
      name: "newsletter_recipients_newsletter_org_fk",
      columns: [table.newsletterId, table.organizationId],
      foreignColumns: [newsletters.id, newsletters.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "newsletter_recipients_contact_org_fk",
      columns: [table.contactId, table.organizationId],
      foreignColumns: [contacts.id, contacts.organizationId],
    }).onDelete("cascade"),
    // La fiche contact : ce que CE contact a reçu.
    index("newsletter_recipients_org_contact_idx").on(table.organizationId, table.contactId),
  ]
);

/**
 * Les articles de veille UTILISÉS par une newsletter (matière du panier
 * passée au composer) : c'est ce qui signale « déjà utilisé » dans le
 * panier et ce qui permet de citer chaque source avec son lien.
 */
export const newsletterSources = pgTable(
  "newsletter_sources",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    newsletterId: uuid("newsletter_id").notNull(),
    itemId: uuid("item_id").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.newsletterId, table.itemId] }),
    foreignKey({
      name: "newsletter_sources_newsletter_org_fk",
      columns: [table.newsletterId, table.organizationId],
      foreignColumns: [newsletters.id, newsletters.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "newsletter_sources_item_org_fk",
      columns: [table.itemId, table.organizationId],
      foreignColumns: [watchItems.id, watchItems.organizationId],
    }).onDelete("cascade"),
    index("newsletter_sources_org_item_idx").on(table.organizationId, table.itemId),
  ]
);

/**
 * Blocs normalisés d'une newsletter. `type` est stocké en texte, pas en enum
 * Postgres : le registre zod des blocs (src/lib/newsletter/blocks.ts) reste
 * l'unique source de vérité sur les types valides, et c'est de lui que sera
 * généré le schéma d'outil transmis à l'IA — jamais deux définitions
 * maintenues séparément (§8 point 3 du dossier de reconstruction).
 */
export const newsletterBlocks = pgTable("newsletter_blocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  newsletterId: uuid("newsletter_id")
    .notNull()
    .references(() => newsletters.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  position: integer("position").notNull().default(0),
  payload: jsonb("payload").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Newsletter = typeof newsletters.$inferSelect;
export type NewNewsletter = typeof newsletters.$inferInsert;
export type NewsletterBlock = typeof newsletterBlocks.$inferSelect;
export type NewNewsletterBlock = typeof newsletterBlocks.$inferInsert;
export type NewsletterRecipient = typeof newsletterRecipients.$inferSelect;
export type NewsletterSource = typeof newsletterSources.$inferSelect;
