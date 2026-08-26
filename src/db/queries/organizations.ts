import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { assertOrgAccess, orgScope } from "@/db/scope";
import { parseBusinessPack, type BusinessPackKey } from "@/lib/metrics/packs";
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

/**
 * L'organisation propriétaire d'une donnée déjà chargée et déjà autorisée
 * (typiquement une affaire passée par `getDeal`, qui a fait son
 * `assertOrgAccess`). À utiliser partout où l'on a besoin de la marque de
 * l'organisation d'UN OBJET plutôt que de celle de l'utilisateur connecté.
 *
 * `assertOrgAccess` est refait ici et non supposé : c'est une lecture par
 * id, elle ne doit jamais servir à récupérer une organisation arbitraire.
 * Un super_admin passe (il n'a pas d'organisation propre mais voit tout),
 * ce qui est exactement le cas que `getOwnOrganizationOrThrow` ne pouvait
 * pas traiter.
 */
export async function getOrganizationOfRecord(user: OrgScopeUser, organizationId: string) {
  assertOrgAccess(user, organizationId);
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });
  if (!org) throw new Error("Organisation introuvable.");
  return org;
}

export type BrandingInput = {
  name: string;
  /** Hexadécimal normalisé (« #2563eb ») ou null — validé par l'écran, jamais une chaîne libre. */
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

/**
 * Choisit le pack métier de l'organisation — le même garde-fou que la
 * marque : un admin, sur SA propre organisation. La clé est validée contre
 * le registre des packs : rien d'autre n'entre en base.
 */
export async function updateOrganizationPack(user: OrgScopeUser, pack: string): Promise<BusinessPackKey> {
  if (user.role !== "admin" || !user.organizationId) {
    throw new Error("Accès refusé : seul l'admin de l'organisation peut choisir le pack métier.");
  }
  const key = parseBusinessPack(pack);
  if (!key) throw new Error("Pack métier inconnu.");
  await db.update(organizations).set({ businessPack: key, updatedAt: new Date() }).where(eq(organizations.id, user.organizationId));
  return key;
}
