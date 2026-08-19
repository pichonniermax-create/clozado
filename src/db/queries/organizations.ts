import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import type { OrgScopeUser } from "@/lib/session";

/**
 * Garde-fou d'isolation, LE modèle à reproduire pour toute future requête
 * métier : un super_admin voit tout, tout autre utilisateur ne voit jamais
 * que les données de sa propre organisation.
 */
export async function getVisibleOrganizations(user: OrgScopeUser) {
  if (user.role === "super_admin") {
    return db.select().from(organizations);
  }

  if (!user.organizationId) {
    // Ne devrait jamais arriver (contrainte en base) : filet de sécurité.
    return [];
  }

  return db
    .select()
    .from(organizations)
    .where(eq(organizations.id, user.organizationId));
}

/** L'organisation de l'utilisateur connecté (null pour un super_admin). */
export async function getOwnOrganization(user: OrgScopeUser) {
  if (!user.organizationId) return null;
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, user.organizationId),
  });
  return org ?? null;
}

export type BrandingInput = {
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  fontFamily: string | null;
};

/**
 * Modifie la marque blanche d'une organisation. Garde-fou d'écriture :
 * seul un admin peut écrire, et uniquement sur SA propre organisation
 * (le WHERE porte sur user.organizationId, jamais sur un id fourni par
 * l'appelant) — même si cette fonction est appelée directement, une
 * autre organisation ne peut jamais être modifiée.
 */
export async function updateOrganizationBranding(
  user: OrgScopeUser,
  data: BrandingInput
) {
  if (user.role !== "admin" || !user.organizationId) {
    throw new Error(
      "Accès refusé : seul l'admin de l'organisation peut modifier ces réglages."
    );
  }

  await db
    .update(organizations)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(organizations.id, user.organizationId));
}
