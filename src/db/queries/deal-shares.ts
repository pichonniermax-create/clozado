import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { dealEvents, dealShares, deals, partners } from "@/db/schema";
import { assertOrgAccess } from "@/db/scope";
import { generateShareToken } from "@/lib/deal-shares/token";
import type { OrgScopeUser } from "@/lib/session";

/**
 * Côté interne, protégé — org-scopé comme tout le reste du produit. Rien
 * ici n'est exposé à la route publique par jeton (voir deal-shares-public.ts,
 * la seule exception à orgScope).
 */

export type CreateShareInput = {
  dealId: string;
  partnerId: string;
  proposedTerms?: string | null;
  message?: string | null;
  expiresAt?: Date | null;
};

/** Crée un partage : génère un jeton, ne stocke que son empreinte, renvoie le jeton en clair — UNE SEULE FOIS, jamais récupérable ensuite. */
export async function createDealShare(
  user: OrgScopeUser,
  createdBy: string,
  input: CreateShareInput
) {
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, input.dealId) });
  if (!deal) throw new Error("Affaire introuvable.");
  assertOrgAccess(user, deal.organizationId);

  const partner = await db.query.partners.findFirst({ where: eq(partners.id, input.partnerId) });
  if (!partner) throw new Error("Partenaire introuvable.");
  assertOrgAccess(user, partner.organizationId);

  // Vérifié ici EN PLUS de la FK composite en base (deal_shares_partner_org_fk) :
  // un message d'erreur clair côté application plutôt qu'une violation de
  // contrainte SQL brute si jamais ces deux lectures divergeaient.
  if (partner.organizationId !== deal.organizationId) {
    throw new Error("Le partenaire et l'affaire n'appartiennent pas à la même organisation.");
  }

  const { token, tokenHash } = generateShareToken();

  const [share] = await db
    .insert(dealShares)
    .values({
      organizationId: deal.organizationId,
      dealId: deal.id,
      partnerId: partner.id,
      tokenHash,
      proposedTerms: input.proposedTerms ?? null,
      message: input.message ?? null,
      expiresAt: input.expiresAt ?? null,
      createdBy,
    })
    .returning();

  await db.insert(dealEvents).values({
    organizationId: deal.organizationId,
    dealId: deal.id,
    shareId: share.id,
    type: "share_sent",
    actorUserId: createdBy,
  });

  return { share, token };
}

/** Partages d'une affaire, plus récents d'abord — jamais le jeton en clair (déjà perdu après création, seul token_hash existe). */
export async function listDealShares(user: OrgScopeUser, dealId: string) {
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  if (!deal) throw new Error("Affaire introuvable.");
  assertOrgAccess(user, deal.organizationId);

  return db
    .select()
    .from(dealShares)
    .where(eq(dealShares.dealId, dealId))
    .orderBy(desc(dealShares.sentAt));
}

export async function revokeDealShare(user: OrgScopeUser, shareId: string) {
  const existing = await db.query.dealShares.findFirst({ where: eq(dealShares.id, shareId) });
  if (!existing) throw new Error("Partage introuvable.");
  assertOrgAccess(user, existing.organizationId);

  if (existing.status === "revoked") return existing;

  const [updated] = await db
    .update(dealShares)
    .set({ status: "revoked", revokedAt: new Date(), updatedAt: new Date() })
    .where(eq(dealShares.id, shareId))
    .returning();

  await db.insert(dealEvents).values({
    organizationId: existing.organizationId,
    dealId: existing.dealId,
    shareId: existing.id,
    type: "share_revoked",
  });

  return updated;
}

/**
 * "Renvoyer le lien" : révoque le partage courant puis en crée un nouveau
 * avec les mêmes conditions — jamais un jeton existant réaffiché (voir
 * src/db/schema/deal-shares.ts).
 */
export async function reissueDealShare(user: OrgScopeUser, createdBy: string, shareId: string) {
  const existing = await db.query.dealShares.findFirst({ where: eq(dealShares.id, shareId) });
  if (!existing) throw new Error("Partage introuvable.");
  assertOrgAccess(user, existing.organizationId);

  await revokeDealShare(user, shareId);

  return createDealShare(user, createdBy, {
    dealId: existing.dealId,
    partnerId: existing.partnerId,
    proposedTerms: existing.proposedTerms,
    message: existing.message,
    expiresAt: existing.expiresAt,
  });
}
