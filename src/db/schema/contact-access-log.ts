import { foreignKey, index, pgEnum, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { organizations } from "./organizations";
import { users } from "./users";

/** Vocabulaire technique fixe du journal des accès — pas une valeur métier. */
export const contactAccessActionEnum = pgEnum("contact_access_action", [
  "view",
  "export",
  "delete",
  "merge",
]);

/**
 * Journal des accès aux fiches contact (exigence données personnelles,
 * cf. docs/module-relationnel.md §C) : qui a consulté/exporté/supprimé/
 * fusionné quelle fiche, quand. Écrit côté serveur, jamais côté client.
 * Pas de purge automatique pour l'instant — à décider quand le volume le
 * justifiera.
 */
export const contactAccessLog = pgTable(
  "contact_access_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    contactId: uuid("contact_id").notNull(),
    /**
     * FK simple (pas composite) : un super_admin sans organisation doit
     * pouvoir apparaître comme lecteur — même raison que
     * deal_events.actorUserId.
     */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: contactAccessActionEnum("action").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "contact_access_log_contact_org_fk",
      columns: [table.contactId, table.organizationId],
      foreignColumns: [contacts.id, contacts.organizationId],
    }).onDelete("cascade"),
    index("contact_access_log_org_contact_idx").on(
      table.organizationId,
      table.contactId,
      table.createdAt
    ),
  ]
);

export type ContactAccessEntry = typeof contactAccessLog.$inferSelect;
