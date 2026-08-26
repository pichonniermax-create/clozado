import { sql } from "drizzle-orm";
import { date, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

/**
 * SOURCE UNIQUE des chiffres que l'IA a le droit de citer sans placeholder,
 * par organisation. Lue à la fois par le compositeur de prompt et par le
 * vérificateur déterministe post-génération — jamais deux copies (§8 point 2
 * du dossier de reconstruction : la désynchronisation entre le prompt et le
 * vérificateur était une classe de bug entière sur le projet d'origine).
 *
 * Un chiffre porte toujours SA SOURCE ET SA DATE (chantier « ciblage et
 * contenu ») : `source_name`/`source_url`/`as_of`. Un chiffre venu d'un
 * indicateur de marché (`indicator_key`) est rafraîchi automatiquement par
 * la collecte, jamais à la main ; un chiffre interne (« 1 200 dossiers
 * financés ») a pour source l'organisation elle-même et la date à laquelle
 * il était vrai. Les lignes d'avant le chantier ont ces champs à NULL : le
 * code les affiche « à compléter » et ne les cite plus tant qu'ils le sont.
 */
export const verifiedFigures = pgTable(
  "verified_figures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Description courte à l'usage de l'admin (ex: "Dossiers financés"). */
    label: text("label").notNull(),
    /** Chaîne exacte citable telle qu'elle doit apparaître, ex: "910", "95 %", "680 M€". */
    value: text("value").notNull(),
    /** Qui publie ce chiffre (ex: "Banque de France", ou le nom de l'organisation pour une donnée interne). */
    sourceName: text("source_name"),
    sourceUrl: text("source_url"),
    /** La date ou la période de la donnée, telle que publiée (ex: "2026-07", "T2 2026"). */
    asOf: text("as_of"),
    /** La même, en date triable (le premier jour de la période). */
    asOfDate: date("as_of_date"),
    /** Clé du catalogue des indicateurs de marché quand le chiffre en vient — alimenté par la collecte. */
    indicatorKey: text("indicator_key"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Un indicateur de marché n'est copié qu'une fois par organisation.
    uniqueIndex("verified_figures_org_indicator_unique")
      .on(table.organizationId, table.indicatorKey)
      .where(sql`${table.indicatorKey} IS NOT NULL`),
  ]
);

export type VerifiedFigure = typeof verifiedFigures.$inferSelect;
export type NewVerifiedFigure = typeof verifiedFigures.$inferInsert;
