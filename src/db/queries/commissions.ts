import { eq } from "drizzle-orm";
import { db } from "@/db";
import { commissions, dealEvents } from "@/db/schema";
import { assertOrgAccess } from "@/db/scope";
import type { OrgScopeUser } from "@/lib/session";

/** Commissions d'une affaire, toutes shares confondues — pour l'affichage sur la fiche affaire. */
export async function listCommissionsForDeal(user: OrgScopeUser, dealId: string) {
  const rows = await db.query.commissions.findMany({ where: eq(commissions.dealId, dealId) });
  for (const c of rows) assertOrgAccess(user, c.organizationId);
  return rows;
}

/**
 * prevue → confirmee : l'affaire aboutit, le montant est arrêté. Idempotent
 * (no-op, pas de nouvel événement) si déjà confirmée ou réglée — jamais un
 * retour en arrière depuis cet écran.
 */
export async function confirmCommission(
  user: OrgScopeUser,
  actorUserId: string,
  commissionId: string
) {
  const commission = await db.query.commissions.findFirst({ where: eq(commissions.id, commissionId) });
  if (!commission) throw new Error("Commission introuvable.");
  assertOrgAccess(user, commission.organizationId);

  if (commission.state !== "prevue") return commission;

  const [updated] = await db
    .update(commissions)
    .set({ state: "confirmee", updatedAt: new Date() })
    .where(eq(commissions.id, commissionId))
    .returning();

  await db.insert(dealEvents).values({
    organizationId: commission.organizationId,
    dealId: commission.dealId,
    shareId: commission.shareId,
    type: "commission_updated",
    message: "Commission confirmée.",
    actorUserId,
  });

  return updated;
}

/**
 * Déclare une commission réglée — une simple constatation ("ça a été payé,
 * ailleurs"), jamais un virement déclenché par l'outil (aucune fonction de
 * paiement dans ce produit).
 */
export async function markCommissionSettled(
  user: OrgScopeUser,
  actorUserId: string,
  commissionId: string
) {
  const commission = await db.query.commissions.findFirst({ where: eq(commissions.id, commissionId) });
  if (!commission) throw new Error("Commission introuvable.");
  assertOrgAccess(user, commission.organizationId);

  if (commission.state === "reglee") return commission;

  const [updated] = await db
    .update(commissions)
    .set({ state: "reglee", updatedAt: new Date() })
    .where(eq(commissions.id, commissionId))
    .returning();

  await db.insert(dealEvents).values({
    organizationId: commission.organizationId,
    dealId: commission.dealId,
    shareId: commission.shareId,
    type: "commission_updated",
    message: "Commission marquée réglée.",
    actorUserId,
  });

  return updated;
}
