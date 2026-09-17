import { sql } from "drizzle-orm";
import { check, customType, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { CropRect } from "@/lib/brand/crop";
import { organizations } from "./organizations";
import { AppError } from "@/lib/errors";

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
    throw new AppError("bytea_format_renvoye_par_le_pilote_inattendu");
  },
});

/**
 * Les images DÉRIVÉES (servies : logo clair, logo sombre, icône) et les
 * SOURCES (migration 0019, correctif cadrage du 2026-09-17) : l'image
 * d'origine rastérisée de chaque logo, conservée pour recadrer plus tard
 * sans réenvoyer le fichier. Chaque dérivée porte son cadre (`crop`, en
 * pixels de sa source) pour rouvrir le cadrage là où il a été laissé.
 */
export const ORGANIZATION_ASSET_KINDS = ["logo_light", "logo_dark", "icon", "logo_light_source", "logo_dark_source"] as const;
export type OrganizationAssetKind = (typeof ORGANIZATION_ASSET_KINDS)[number];
export const ORGANIZATION_ASSET_SOURCE_KINDS = ["logo_light_source", "logo_dark_source"] as const satisfies readonly OrganizationAssetKind[];

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
    /** Le cadre dont cette image dérivée est le rendu, en pixels de sa source — null pour une source, ou une image d'avant le cadrage. */
    crop: jsonb("crop").$type<CropRect>(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.organizationId, table.kind] }),
    check("organization_assets_kind_check", sql`${table.kind} IN ('logo_light', 'logo_dark', 'icon', 'logo_light_source', 'logo_dark_source')`),
  ]
);

export type OrganizationAsset = typeof organizationAssets.$inferSelect;
