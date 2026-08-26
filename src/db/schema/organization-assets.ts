import { sql } from "drizzle-orm";
import { check, customType, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

/**
 * `bytea` : drizzle-orm n'a pas de colonne native. Le pilote HTTP de Neon
 * parle le format hexadécimal texte de Postgres (`\\x…`) dans les deux sens ;
 * `fromDriver` accepte aussi un tampon, au cas où un pilote en renvoie un.
 */
export const bytea = customType<{ data: Buffer; driverData: string }>({
  dataType() {
    return "bytea";
  },
  toDriver(value: Buffer): string {
    return `\\x${value.toString("hex")}`;
  },
  fromDriver(value: unknown): Buffer {
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    if (typeof value === "string") {
      return value.startsWith("\\x") ? Buffer.from(value.slice(2), "hex") : Buffer.from(value, "base64");
    }
    throw new Error("bytea : format renvoyé par le pilote inattendu.");
  },
});

export const ORGANIZATION_ASSET_KINDS = ["logo_light", "logo_dark", "icon"] as const;
export type OrganizationAssetKind = (typeof ORGANIZATION_ASSET_KINDS)[number];

/**
 * Les IMAGES de la marque d'une organisation (chantier « marque blanche »,
 * migration 0015) : le logo pour fond clair, le logo pour fond sombre, et
 * l'icône (favicon) dérivée du logo. Redimensionnées dans le navigateur
 * avant l'envoi (1 200 × 400 px au plus, icône 128 × 128), stockées en base
 * — trois images de 100 ko au plus par organisation — et servies par une
 * route publique avec un cache long. Décision validée « pour maintenant » :
 * au-delà de quelques centaines d'organisations ou d'images plus lourdes,
 * un stockage dédié (Vercel Blob) prendra le relais avec la même table et
 * une URL à la place des octets (docs/module-marque-blanche-i18n.md §3).
 */
export const organizationAssets = pgTable(
  "organization_assets",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    mime: text("mime").notNull(),
    bytes: bytea("bytes").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.kind] }),
    check("organization_assets_kind_check", sql`${table.kind} IN ('logo_light', 'logo_dark', 'icon')`),
  ]
);

export type OrganizationAsset = typeof organizationAssets.$inferSelect;
