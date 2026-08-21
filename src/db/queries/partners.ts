import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { partners } from "@/db/schema";
import { assertOrgAccess, orgScope } from "@/db/scope";
import type { OrgScopeUser } from "@/lib/session";

/** Partenaires de l'organisation de l'appelant. */
export async function listPartners(user: OrgScopeUser) {
  const scope = orgScope(user, partners.organizationId);
  const query = db.select().from(partners).orderBy(asc(partners.name));
  return scope ? query.where(scope) : query;
}

export async function getPartner(user: OrgScopeUser, id: string) {
  const partner = await db.query.partners.findFirst({ where: eq(partners.id, id) });
  if (!partner) return null;
  assertOrgAccess(user, partner.organizationId);
  return partner;
}

export type CreatePartnerInput = {
  name: string;
  company?: string | null;
  profession?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
};

export async function createPartner(user: OrgScopeUser, input: CreatePartnerInput) {
  if (!user.organizationId) {
    throw new Error("Aucune organisation sélectionnée. Choisis une organisation dans le bandeau super admin en haut de l'écran avant de créer un partenaire.");
  }
  const [partner] = await db
    .insert(partners)
    .values({ organizationId: user.organizationId, ...input })
    .returning();
  return partner;
}

export async function updatePartner(
  user: OrgScopeUser,
  id: string,
  input: Partial<CreatePartnerInput> & { active?: boolean }
) {
  const existing = await db.query.partners.findFirst({ where: eq(partners.id, id) });
  if (!existing) throw new Error("Partenaire introuvable.");
  assertOrgAccess(user, existing.organizationId);

  const [updated] = await db
    .update(partners)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(partners.id, id))
    .returning();
  return updated;
}
