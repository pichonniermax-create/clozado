import { randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { commissions, dealEvents, dealShares, deals, partners } from "@/db/schema";
import { assertOrgAccess } from "@/db/scope";
import { generateShareToken } from "@/lib/deal-shares/token";
import type { OrgScopeUser } from "@/lib/session";
import { AppError } from "@/lib/errors";

/**
 * Côté interne, protégé — org-scopé comme tout le reste du produit. Rien
 * ici n'est exposé à la route publique par jeton (voir deal-shares-public.ts,
 * la seule exception à orgScope).
 */

export type CreateShareCommissionInput = {
  basis: "percentage" | "fixed";
  rate?: string | null;
  fixedAmount?: string | null;
  baseAmount?: string | null;
  computedAmount?: string | null;
};

export type CreateShareInput = {
  dealId: string;
  partnerId: string;
  proposedTerms?: string | null;
  message?: string | null;
  expiresAt?: Date | null;
  /**
   * C'est le moment où le conseiller fixe une commission qui l'engage
   * vis-à-vis d'un confrère — formalisée dès l'envoi, pas laissée en texte
   * libre à interpréter plus tard.
   */
  commission?: CreateShareCommissionInput | null;
  /** Renvoi de lien : le partage que celui-ci remplace (chaîne suivie par l'analytique). */
  replacesShareId?: string | null;
};

/**
 * Crée un partage : génère un jeton, ne stocke que son empreinte, renvoie
 * le jeton en clair — UNE SEULE FOIS, jamais récupérable ensuite. L'id du
 * partage est généré ici (pas par la base) pour pouvoir insérer partage +
 * commission + événement en un seul `db.batch()` atomique — le driver
 * neon-http ne supporte pas `db.transaction()` (même contrainte que pour
 * `saveNewsletter`, voir src/lib/newsletter/actions.ts).
 */
export async function createDealShare(
  user: OrgScopeUser,
  createdBy: string,
  input: CreateShareInput
) {
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, input.dealId) });
  if (!deal) throw new AppError("affaire_introuvable", undefined, 404);
  assertOrgAccess(user, deal.organizationId);

  const partner = await db.query.partners.findFirst({ where: eq(partners.id, input.partnerId) });
  if (!partner) throw new AppError("partenaire_introuvable", undefined, 404);
  assertOrgAccess(user, partner.organizationId);

  // Vérifié ici EN PLUS de la FK composite en base (deal_shares_partner_org_fk) :
  // un message d'erreur clair côté application plutôt qu'une violation de
  // contrainte SQL brute si jamais ces deux lectures divergeaient.
  if (partner.organizationId !== deal.organizationId) {
    throw new AppError("le_partenaire_et_l_affaire_n_appartiennent_47db");
  }

  const { token, tokenHash } = generateShareToken();
  const shareId = randomUUID();

  const shareInsert = db.insert(dealShares).values({
    id: shareId,
    organizationId: deal.organizationId,
    dealId: deal.id,
    partnerId: partner.id,
    tokenHash,
    proposedTerms: input.proposedTerms ?? null,
    message: input.message ?? null,
    expiresAt: input.expiresAt ?? null,
    replacesShareId: input.replacesShareId ?? null,
    createdBy,
  });
  const eventInsert = db.insert(dealEvents).values({
    organizationId: deal.organizationId,
    dealId: deal.id,
    shareId,
    type: "share_sent",
    actorUserId: createdBy,
  });

  if (input.commission) {
    const commission = input.commission;
    await db.batch([
      shareInsert,
      eventInsert,
      db.insert(commissions).values({
        organizationId: deal.organizationId,
        dealId: deal.id,
        shareId,
        basis: commission.basis,
        rate: commission.basis === "percentage" ? (commission.rate ?? null) : null,
        fixedAmount: commission.basis === "fixed" ? (commission.fixedAmount ?? null) : null,
        baseAmount: commission.baseAmount ?? null,
        computedAmount: commission.computedAmount ?? null,
        state: "prevue",
      }),
    ]);
  } else {
    await db.batch([shareInsert, eventInsert]);
  }

  const share = await db.query.dealShares.findFirst({ where: eq(dealShares.id, shareId) });
  if (!share) throw new AppError("incoherence_interne_partage_disparu_juste_apres_sa_a47b", undefined, 404);

  return { share, token };
}

/** Partages d'une affaire, avec le nom du partenaire — jamais le jeton en clair (déjà perdu après création, seul token_hash existe). */
export async function listDealShares(user: OrgScopeUser, dealId: string) {
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  if (!deal) throw new AppError("affaire_introuvable", undefined, 404);
  assertOrgAccess(user, deal.organizationId);

  return db
    .select({ share: dealShares, partnerName: partners.name })
    .from(dealShares)
    .innerJoin(partners, eq(dealShares.partnerId, partners.id))
    .where(eq(dealShares.dealId, dealId))
    .orderBy(desc(dealShares.sentAt));
}

export async function revokeDealShare(user: OrgScopeUser, shareId: string, actorUserId?: string | null) {
  const existing = await db.query.dealShares.findFirst({ where: eq(dealShares.id, shareId) });
  if (!existing) throw new AppError("partage_introuvable", undefined, 404);
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
    actorUserId: actorUserId ?? null,
  });

  return updated;
}

/** Historique des affaires partagées avec CE partenaire — pour sa fiche. */
export async function listDealSharesForPartner(user: OrgScopeUser, partnerId: string) {
  const partner = await db.query.partners.findFirst({ where: eq(partners.id, partnerId) });
  if (!partner) throw new AppError("partenaire_introuvable", undefined, 404);
  assertOrgAccess(user, partner.organizationId);

  return db
    .select({ share: dealShares, deal: deals })
    .from(dealShares)
    .innerJoin(deals, eq(dealShares.dealId, deals.id))
    .where(eq(dealShares.partnerId, partnerId))
    .orderBy(desc(dealShares.sentAt));
}

/**
 * "Renvoyer le lien" : révoque le partage courant puis en crée un nouveau
 * avec les mêmes conditions (y compris la commission déjà fixée) — jamais
 * un jeton existant réaffiché (voir src/db/schema/deal-shares.ts).
 */
export async function reissueDealShare(user: OrgScopeUser, createdBy: string, shareId: string) {
  const existing = await db.query.dealShares.findFirst({ where: eq(dealShares.id, shareId) });
  if (!existing) throw new AppError("partage_introuvable", undefined, 404);
  assertOrgAccess(user, existing.organizationId);

  const existingCommission = await db.query.commissions.findFirst({
    where: eq(commissions.shareId, shareId),
  });

  await revokeDealShare(user, shareId, createdBy);

  return createDealShare(user, createdBy, {
    dealId: existing.dealId,
    partnerId: existing.partnerId,
    proposedTerms: existing.proposedTerms,
    message: existing.message,
    expiresAt: existing.expiresAt,
    // La chaîne : pour l'analytique, un lien renvoyé n'est pas un second
    // partage sans réponse, c'est le même, envoyé à la date du premier.
    replacesShareId: existing.id,
    commission: existingCommission
      ? {
          basis: existingCommission.basis,
          rate: existingCommission.rate,
          fixedAmount: existingCommission.fixedAmount,
          baseAmount: existingCommission.baseAmount,
          computedAmount: existingCommission.computedAmount,
        }
      : null,
  });
}
