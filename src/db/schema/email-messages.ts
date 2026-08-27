import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { newsletters } from "./newsletters";
import { organizations } from "./organizations";
import { rules } from "./rules";
import { users } from "./users";

/**
 * L'ENVOI RÉEL d'une newsletter comme travail de fond (chantier engagement,
 * migration 0016) : une ligne par lancement, la photographie du rendu
 * envoyé (objet, HTML, texte — ce qui est parti, relisible même si les
 * blocs changent ensuite), les compteurs, et le bail d'exécution.
 *
 * Un envoi ouvert (`finished_at` NULL) est repris par le cron ou par le
 * bouton « Reprendre » tant qu'il reste des messages en file ; UN seul
 * envoi ouvert par newsletter, garanti par la base (index partiel unique),
 * et un seul exécutant à la fois par le bail (`lease_until`, pris par un
 * UPDATE atomique). Un quota du fournisseur atteint met l'envoi en pause
 * (`paused_until`, `pause_reason`) : l'écran le dit, le cron reprend.
 */
export const newsletterSends = pgTable(
  "newsletter_sends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    newsletterId: uuid("newsletter_id").notNull(),
    startedBy: uuid("started_by").references(() => users.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    /** Le bail de l'exécutant courant : un autre ne reprend qu'après son expiration. */
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    pausedUntil: timestamp("paused_until", { withTimezone: true }),
    pauseReason: text("pause_reason"),
    error: text("error"),
    queued: integer("queued").notNull().default(0),
    sent: integer("sent").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    /** La photographie du rendu envoyé. */
    subject: text("subject").notNull(),
    html: text("html").notNull(),
    textBody: text("text_body").notNull(),
  },
  (table) => [
    unique("newsletter_sends_id_org_unique").on(table.id, table.organizationId),
    foreignKey({
      name: "newsletter_sends_newsletter_org_fk",
      columns: [table.newsletterId, table.organizationId],
      foreignColumns: [newsletters.id, newsletters.organizationId],
    }).onDelete("cascade"),
    uniqueIndex("newsletter_sends_newsletter_open_unique")
      .on(table.newsletterId)
      .where(sql`${table.finishedAt} IS NULL`),
    index("newsletter_sends_org_started_idx").on(table.organizationId, table.startedAt),
  ]
);

/**
 * UN EMAIL ENVOYÉ À UNE PERSONNE — une ligne par destinataire et par envoi,
 * quelle que soit sa nature (`kind`) : `newsletter` (un destinataire d'un
 * envoi), `test` (« m'envoyer cette newsletter », vers la personne
 * connectée, jamais vers un contact), `automatic` (envoyé par une règle),
 * `manual` (préparé par une règle en brouillon, relu et envoyé par une
 * personne). L'`id` (uuid v4, `gen_random_uuid()` : 122 bits aléatoires,
 * ni séquentiel ni énumérable) sert de clé d'idempotence auprès du
 * fournisseur ET de jeton de désinscription.
 *
 * `to_email` est l'adresse AU MOMENT de l'envoi (une fiche change, un envoi
 * non) ; `from_email`/`reply_to` sont les en-têtes réellement posés — la
 * preuve du repli et de la bascule. Les compteurs d'ouverture et de clic
 * sont dénormalisés ici depuis `email_events` (la chronologie brute).
 * Ni adresse IP ni navigateur, nulle part (minimisation, décision validée).
 */
export const emailMessages = pgTable(
  "email_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    newsletterId: uuid("newsletter_id"),
    sendId: uuid("send_id"),
    contactId: uuid("contact_id"),
    ruleId: uuid("rule_id"),
    toEmail: text("to_email").notNull(),
    fromEmail: text("from_email").notNull(),
    replyTo: text("reply_to"),
    subject: text("subject").notNull(),
    /** Le corps texte d'un email individuel (règle, brouillon) ; NULL pour un destinataire de newsletter (le rendu vit sur l'envoi). */
    body: text("body"),
    status: text("status").notNull().default("queued"),
    providerMessageId: text("provider_message_id"),
    queuedAt: timestamp("queued_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    firstOpenedAt: timestamp("first_opened_at", { withTimezone: true }),
    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
    openCount: integer("open_count").notNull().default(0),
    firstClickedAt: timestamp("first_clicked_at", { withTimezone: true }),
    lastClickedAt: timestamp("last_clicked_at", { withTimezone: true }),
    clickCount: integer("click_count").notNull().default(0),
    bouncedAt: timestamp("bounced_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("email_messages_id_org_unique").on(table.id, table.organizationId),
    foreignKey({
      name: "email_messages_newsletter_org_fk",
      columns: [table.newsletterId, table.organizationId],
      foreignColumns: [newsletters.id, newsletters.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "email_messages_send_org_fk",
      columns: [table.sendId, table.organizationId],
      foreignColumns: [newsletterSends.id, newsletterSends.organizationId],
    }).onDelete("cascade"),
    // Un contact ne se supprime jamais physiquement (pierre tombale) : la cascade ne joue qu'avec l'organisation.
    foreignKey({
      name: "email_messages_contact_org_fk",
      columns: [table.contactId, table.organizationId],
      foreignColumns: [contacts.id, contacts.organizationId],
    }).onDelete("cascade"),
    // Une règle ne se supprime jamais (elle s'archive) : pas d'action de suppression à prévoir.
    foreignKey({
      name: "email_messages_rule_org_fk",
      columns: [table.ruleId, table.organizationId],
      foreignColumns: [rules.id, rules.organizationId],
    }),
    check("email_messages_kind_check", sql`${table.kind} IN ('newsletter', 'test', 'automatic', 'manual')`),
    check(
      "email_messages_status_check",
      sql`${table.status} IN ('draft', 'queued', 'sent', 'delivered', 'delayed', 'bounced', 'complained', 'failed', 'canceled')`
    ),
    // Chaque nature porte ses rattachements : un destinataire de newsletter a sa newsletter et son contact ;
    // un test n'a pas de contact ; un email de règle a sa règle et son contact ; un email manuel, son contact.
    check(
      "email_messages_kind_links_check",
      sql`(${table.kind} = 'newsletter' AND ${table.newsletterId} IS NOT NULL AND ${table.contactId} IS NOT NULL)
        OR (${table.kind} = 'test' AND ${table.contactId} IS NULL)
        OR (${table.kind} = 'automatic' AND ${table.ruleId} IS NOT NULL AND ${table.contactId} IS NOT NULL)
        OR (${table.kind} = 'manual' AND ${table.contactId} IS NOT NULL)`
    ),
    uniqueIndex("email_messages_provider_id_unique")
      .on(table.providerMessageId)
      .where(sql`${table.providerMessageId} IS NOT NULL`),
    // La fiche contact : ce que CE contact a reçu, dans l'ordre.
    index("email_messages_org_contact_created_idx").on(table.organizationId, table.contactId, table.createdAt),
    // La campagne : ses destinataires par état.
    index("email_messages_org_newsletter_status_idx").on(table.organizationId, table.newsletterId, table.status),
    // Le plafond des envois automatiques : les emails de règle d'un contact sur la période.
    index("email_messages_org_kind_sent_idx").on(table.organizationId, table.kind, table.sentAt),
    // L'exécutant d'un envoi : le prochain lot en file.
    index("email_messages_send_status_idx").on(table.sendId, table.status),
  ]
);

/**
 * LA CHRONOLOGIE BRUTE des webhooks du fournisseur (remis, ouvert, cliqué,
 * rejeté…) et de nos propres gestes (désinscription). `provider_event_id`
 * est l'identifiant Svix du webhook : un webhook rejoué est ignoré par
 * l'unicité, jamais compté deux fois. `detail` ne porte que le motif d'un
 * rejet ou d'un retard — jamais l'adresse IP ni le navigateur que le
 * fournisseur envoie avec une ouverture ou un clic.
 */
export const emailEvents = pgTable(
  "email_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").notNull(),
    type: text("type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    /** Le lien cliqué. */
    url: text("url"),
    detail: jsonb("detail"),
    providerEventId: text("provider_event_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "email_events_message_org_fk",
      columns: [table.messageId, table.organizationId],
      foreignColumns: [emailMessages.id, emailMessages.organizationId],
    }).onDelete("cascade"),
    check(
      "email_events_type_check",
      sql`${table.type} IN ('sent', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'opened', 'clicked', 'failed', 'suppressed', 'unsubscribed')`
    ),
    uniqueIndex("email_events_provider_id_unique")
      .on(table.providerEventId)
      .where(sql`${table.providerEventId} IS NOT NULL`),
    index("email_events_org_message_occurred_idx").on(table.organizationId, table.messageId, table.occurredAt),
  ]
);

/**
 * LES ADRESSES AUXQUELLES ON N'ÉCRIT PLUS — par organisation : une adresse
 * désinscrite du cabinet A reçoit toujours le cabinet B, chaque
 * organisation est un expéditeur distinct (décision validée). Alimentée
 * par le lien de désinscription (page ou un clic `List-Unsubscribe-Post`),
 * par les webhooks (rejet définitif, plainte) et à la main. La sélection
 * des destinataires et les règles l'excluent ; la fiche contact le dit.
 * Un désinscrit n'est plus jamais suivi ni relancé.
 *
 * IRRÉVERSIBLE : une désinscription (`reason = 'unsubscribed'`) ne se
 * retire jamais — ni bouton, ni action, ni geste d'administrateur ; la
 * base elle-même refuse le DELETE et la modification de la ligne
 * (déclencheur `email_suppressions_keep_unsubscribed`, migration 0016,
 * hors du périmètre de drizzle-kit). Seule la suppression de
 * l'organisation entière l'emporte.
 */
export const emailSuppressions = pgTable(
  "email_suppressions",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** En minuscules. */
    email: text("email").notNull(),
    reason: text("reason").notNull(),
    source: text("source").notNull(),
    /** L'email d'où vient le geste (le message dont le lien a été cliqué, le message rejeté). */
    messageId: uuid("message_id"),
    contactId: uuid("contact_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.email] }),
    // Un message ne se supprime qu'avec son organisation : la cascade ne joue que là.
    foreignKey({
      name: "email_suppressions_message_org_fk",
      columns: [table.messageId, table.organizationId],
      foreignColumns: [emailMessages.id, emailMessages.organizationId],
    }).onDelete("cascade"),
    foreignKey({
      name: "email_suppressions_contact_org_fk",
      columns: [table.contactId, table.organizationId],
      foreignColumns: [contacts.id, contacts.organizationId],
    }).onDelete("cascade"),
    check("email_suppressions_reason_check", sql`${table.reason} IN ('unsubscribed', 'bounced', 'complained', 'manual')`),
    check("email_suppressions_source_check", sql`${table.source} IN ('link', 'one_click', 'webhook', 'manual')`),
    index("email_suppressions_org_contact_idx").on(table.organizationId, table.contactId),
  ]
);

export type NewsletterSend = typeof newsletterSends.$inferSelect;
export type EmailMessage = typeof emailMessages.$inferSelect;
export type NewEmailMessage = typeof emailMessages.$inferInsert;
export type EmailEvent = typeof emailEvents.$inferSelect;
export type EmailSuppression = typeof emailSuppressions.$inferSelect;
