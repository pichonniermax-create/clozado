import { eq } from "drizzle-orm";
import { db } from "@/db";
import { commissions, dealEvents } from "@/db/schema";
import { assertOrgAccess } from "@/db/scope";
import type { OrgScopeUser } from "@/lib/session";

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
