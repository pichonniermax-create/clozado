import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { signatories } from "./signatories";

/**
 * Une cible/persona de newsletter (ex: "B2C Découverte"), rattachée à une
 * organisation. VOLONTAIREMENT des lignes de table et non un type Postgres
 * figé : une organisation doit pouvoir avoir 2 cibles, 6, ou en renommer une,
 * sans migration de schéma (§7.2 du dossier de reconstruction — l'erreur la
 * plus coûteuse du projet d'origine était un enum "NL1|NL2|NL3" en dur).
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
     * Identité éditoriale complète (voix, angle, ce qu'il faut éviter),
     * injectée telle quelle dans le prompt de composition IA.
     */
    editorialVoice: text("editorial_voice").notNull(),
    /** Accent UI de la carte cible dans le composer, en hexadécimal. */
    accentColor: text("accent_color"),
    defaultSignatoryId: uuid("default_signatory_id").references(() => signatories.id, {
      onDelete: "set null",
    }),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("mail_targets_org_slug_unique").on(table.organizationId, table.slug)]
);

export type MailTarget = typeof mailTargets.$inferSelect;
export type NewMailTarget = typeof mailTargets.$inferInsert;
