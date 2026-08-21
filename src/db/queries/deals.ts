import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { deals, dealStatuses, dealTypes } from "@/db/schema";
import { assertOrgAccess, orgScope } from "@/db/scope";
import { getDefaultDealStatus } from "./deal-statuses";
import type { OrgScopeUser } from "@/lib/session";

/** Affaires de l'organisation de l'appelant, plus récentes d'abord. */
export async function listDeals(user: OrgScopeUser) {
  const scope = orgScope(user, deals.organizationId);
  const query = db.select().from(deals).orderBy(desc(deals.updatedAt));
  return scope ? query.where(scope) : query;
}

export async function getDeal(user: OrgScopeUser, id: string) {
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, id) });
  if (!deal) return null;
  assertOrgAccess(user, deal.organizationId);
  return deal;
}

export type CreateDealInput = {
  title: string;
  clientName: string;
  typeId: string;
  /** Statut initial optionnel — si absent, le statut "nouveau" de l'organisation est utilisé. */
  statusId?: string;
  estimatedAmount?: string | null;
  description?: string | null;
};

export async function createDeal(
  user: OrgScopeUser,
  createdBy: string,
  input: CreateDealInput
) {
  if (!user.organizationId) {
    throw new Error("Aucune organisation associée à cet utilisateur.");
  }

  // Le type doit exister ET appartenir à cette organisation — vérifié ici
  // en plus de la FK composite en base (message d'erreur clair côté
  // application plutôt qu'une simple violation de contrainte SQL).
  const type = await db.query.dealTypes.findFirst({ where: eq(dealTypes.id, input.typeId) });
  if (!type || type.organizationId !== user.organizationId) {
    throw new Error("Type d'affaire introuvable pour cette organisation.");
  }

  let statusId = input.statusId;
  if (statusId) {
    const status = await db.query.dealStatuses.findFirst({ where: eq(dealStatuses.id, statusId) });
    if (!status || status.organizationId !== user.organizationId) {
      throw new Error("Statut introuvable pour cette organisation.");
    }
  } else {
    statusId = (await getDefaultDealStatus(user.organizationId)).id;
  }

  const [deal] = await db
    .insert(deals)
    .values({
      organizationId: user.organizationId,
      title: input.title,
      clientName: input.clientName,
      typeId: input.typeId,
      statusId,
      estimatedAmount: input.estimatedAmount ?? null,
      description: input.description ?? null,
      createdBy,
    })
    .returning();
  return deal;
}

export async function updateDealStatus(user: OrgScopeUser, dealId: string, statusId: string) {
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  if (!deal) throw new Error("Affaire introuvable.");
  assertOrgAccess(user, deal.organizationId);

  const status = await db.query.dealStatuses.findFirst({ where: eq(dealStatuses.id, statusId) });
  if (!status || status.organizationId !== deal.organizationId) {
    throw new Error("Statut introuvable pour cette organisation.");
  }

  const [updated] = await db
    .update(deals)
    .set({ statusId, updatedAt: new Date() })
    .where(eq(deals.id, dealId))
    .returning();
  return updated;
}
