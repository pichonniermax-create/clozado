import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { orgScope } from "@/db/scope";
import type { OrgScopeUser } from "@/lib/session";

/**
 * Première utilisation du garde-fou générique orgScope (src/db/scope.ts) :
 * un super_admin voit tout, tout autre utilisateur ne voit jamais que sa
 * propre organisation. C'est ce même helper que les futurs outils métier
 * réutiliseront sur leurs propres tables.
 */
export async function getVisibleOrganizations(user: OrgScopeUser) {
  const scope = orgScope(user, organizations.id);
  return scope
    ? db.select().from(organizations).where(scope)
    : db.select().from(organizations);
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
