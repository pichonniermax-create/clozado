import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { organizationAssets, ORGANIZATION_ASSET_KINDS, type OrganizationAsset, type OrganizationAssetKind } from "@/db/schema";
import type { OrgScopeUser } from "@/lib/session";
import { AppError } from "@/lib/errors";

/**
 * Les images de la marque (chantier marque blanche, étape 2). Écriture :
 * un admin, sur SA propre organisation — le WHERE porte sur
 * `user.organizationId`, jamais sur un id fourni par l'appelant (même
 * garde-fou que la marque). Lecture publique par id d'organisation : un
 * logo est public par nature, la route `/brand/[organisation]/[kind]` le
 * sert avec un cache long.
 */
export const ASSET_MAX_BYTES = 400_000;

export function isAssetKind(value: string): value is OrganizationAssetKind {
  return (ORGANIZATION_ASSET_KINDS as readonly string[]).includes(value);
}

function requireAdmin(user: OrgScopeUser): string {
  if (user.role !== "admin" || !user.organizationId) {
    throw new AppError("acces_refuse_seul_l_admin_de_l_bed5", undefined, 403);
  }
  return user.organizationId;
}

export type AssetInput = { mime: string; bytes: Buffer; width: number; height: number };

export async function upsertOrganizationAsset(user: OrgScopeUser, kind: OrganizationAssetKind, input: AssetInput): Promise<void> {
  const organizationId = requireAdmin(user);
  if (input.bytes.length === 0 || input.bytes.length > ASSET_MAX_BYTES) {
    throw new AppError("l_image_depasse_ko_une_fois_redimensionnee_f84f", { round: Math.round(ASSET_MAX_BYTES / 1000) });
  }
  await db
    .insert(organizationAssets)
    .values({ organizationId, kind, mime: input.mime, bytes: input.bytes, width: input.width, height: input.height, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [organizationAssets.organizationId, organizationAssets.kind],
      set: { mime: input.mime, bytes: input.bytes, width: input.width, height: input.height, updatedAt: new Date() },
    });
}

export async function deleteOrganizationAssets(user: OrgScopeUser, kinds: readonly OrganizationAssetKind[] = ORGANIZATION_ASSET_KINDS): Promise<void> {
  const organizationId = requireAdmin(user);
  for (const kind of kinds) {
    await db.delete(organizationAssets).where(and(eq(organizationAssets.organizationId, organizationId), eq(organizationAssets.kind, kind)));
  }
}

/** Lecture publique (la route) : l'image, ou null. */
export async function getOrganizationAsset(organizationId: string, kind: OrganizationAssetKind): Promise<OrganizationAsset | null> {
  const row = await db.query.organizationAssets.findFirst({
    where: and(eq(organizationAssets.organizationId, organizationId), eq(organizationAssets.kind, kind)),
  });
  return row ?? null;
}

export type AssetMeta = { kind: OrganizationAssetKind; width: number; height: number; updatedAt: Date };

/** Ce que les écrans ont besoin de savoir SANS charger les octets : quelles images existent, leur taille, leur version. */
export async function listOrganizationAssetMeta(organizationId: string): Promise<AssetMeta[]> {
  const rows = await db
    .select({ kind: organizationAssets.kind, width: organizationAssets.width, height: organizationAssets.height, updatedAt: organizationAssets.updatedAt })
    .from(organizationAssets)
    .where(eq(organizationAssets.organizationId, organizationId));
  return rows.filter((r): r is AssetMeta => isAssetKind(r.kind)).map((r) => ({ ...r, kind: r.kind as OrganizationAssetKind }));
}
