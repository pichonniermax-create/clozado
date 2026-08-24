import { integer, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

/**
 * Les ORIGINES d'acquisition d'une organisation — des lignes de table, par
 * organisation, jamais un vocabulaire figé (décision de l'utilisateur,
 * module analytique) : « Simulateur crédit », « Page assurance-vie »,
 * « Campagne LinkedIn »… Un lead ou un événement arrive avec une origine
 * en texte (`origin_raw`) ; si elle correspond à une ligne d'ici, il est
 * rattaché ; sinon la valeur libre reste en débordement et remonte dans
 * l'écran de rapprochement, où on la rattache à une origine — le
 * rattachement s'applique alors à tout l'historique portant ce texte.
 */
export const origins = pgTable(
  "origins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("origins_org_label_unique").on(table.organizationId, table.label),
    // Cible des FK composites de leads, acquisition_events.
    unique("origins_id_org_unique").on(table.id, table.organizationId),
  ]
);

export type Origin = typeof origins.$inferSelect;
