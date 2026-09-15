import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { commissions, dealEvents, dealShares, deals, partners } from "@/db/schema";
import { assertOrgAccess } from "@/db/scope";
import { isExpiryInPast, reissuedExpiry } from "@/lib/deal-shares/expiry";
import { computeCommissionAmount, CREATE_SHARE_SCHEMA, isCommissionComplete, type CreateShareInput } from "@/lib/deal-shares/input";
import { generateShareToken } from "@/lib/deal-shares/token";
import type { OrgScopeUser } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { readInput } from "@/lib/validation";

/**
 * Côté interne, protégé — org-scopé comme tout le reste du produit. Rien
 * ici n'est exposé à la route publique par jeton (voir deal-shares-public.ts,
 * la seule exception à orgScope).
 */

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
  rawInput: CreateShareInput
) {
  const input = readInput(CREATE_SHARE_SCHEMA, rawInput);
  // Un lien qui naîtrait expiré n'est pas un partage : dit tout de suite, avant toute écriture.
  if (isExpiryInPast(input.expiresAt)) throw new AppError("la_date_d_expiration_est_deja_passee");
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
  // Un seul partage EN ATTENTE par (affaire, partenaire) : un second créerait deux jetons vivants et deux
  // commissions « prévues » (chasse aux failles du 2026-09-14) — on renvoie le lien, on n'en crée pas un autre.
  const [pending] = await db
    .select({ id: dealShares.id })
    .from(dealShares)
    .where(and(eq(dealShares.dealId, deal.id), eq(dealShares.partnerId, partner.id), eq(dealShares.status, "pending")))
    .limit(1);
  if (pending) throw new AppError("un_partage_est_deja_en_attente_pour_ce_partenaire", undefined, 409);
  if (input.commission && !isCommissionComplete(input.commission)) throw new AppError("les_donnees_envoyees_ne_sont_pas_valides");

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
        // Calculé ICI, jamais reçu du client.
        computedAmount: computeCommissionAmount(commission),
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
  // Seul un partage EN ATTENTE se renvoie (chasse aux failles du 2026-09-14) : renvoyer un partage accepté ou
  // refusé fabriquait un second jeton vivant et une seconde commission « prévue » par-dessus la première.
  if (existing.status !== "pending") throw new AppError("seul_un_partage_en_attente_se_renvoie", undefined, 409);

  await revokeDealShare(user, shareId, createdBy);

  const created = await createDealShare(user, createdBy, {
    dealId: existing.dealId,
    partnerId: existing.partnerId,
    proposedTerms: existing.proposedTerms,
    message: existing.message,
    // Une fenêtre de validité NEUVE, de la même durée, comptée d'aujourd'hui (correctif du 2026-09-14 :
    // recopier l'ancienne date faisait naître expiré le lien renvoyé d'un partage expiré).
    expiresAt: reissuedExpiry(existing),
    // La chaîne : pour l'analytique, un lien renvoyé n'est pas un second
    // partage sans réponse, c'est le même, envoyé à la date du premier.
    replacesShareId: existing.id,
    commission: null,
  });
  // La commission SUIT le nouveau partage — une seule ligne, jamais une copie.
  await db.update(commissions).set({ shareId: created.share.id, updatedAt: new Date() }).where(eq(commissions.shareId, existing.id));
  return created;
}
