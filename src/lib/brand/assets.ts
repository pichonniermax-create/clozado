import type { OrganizationAssetKind } from "@/db/schema";
import type { AssetMeta } from "@/db/queries/organization-assets";

/**
 * Les adresses des images de la marque et la lecture minimale d'un PNG —
 * partagées par l'écran des réglages, la coquille et la route publique.
 * Aucune dépendance : les dimensions d'un PNG sont dans son en-tête
 * (IHDR), à un décalage fixe.
 */

/** `/brand/<organisation>/<kind>?v=<version>` — la version change avec l'image : le cache peut être long. */
export function assetUrl(organizationId: string, kind: OrganizationAssetKind, updatedAt: Date): string {
  return `/brand/${organizationId}/${kind}?v=${updatedAt.getTime()}`;
}

export type BrandAssetUrls = Partial<Record<OrganizationAssetKind, string>>;

export function assetUrlsFromMeta(organizationId: string, meta: AssetMeta[]): BrandAssetUrls {
  const urls: BrandAssetUrls = {};
  for (const m of meta) urls[m.kind] = assetUrl(organizationId, m.kind, m.updatedAt);
  return urls;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Largeur et hauteur d'un PNG (en-tête IHDR), ou null si ce n'est pas un PNG. */
export function readPngSize(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (bytes.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** `data:image/png;base64,…` → les octets, ou null si ce n'est pas une image PNG encodée ainsi. */
export function decodePngDataUrl(dataUrl: string): Buffer | null {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!match) return null;
  try {
    return Buffer.from(match[1], "base64");
  } catch {
    return null;
  }
}
