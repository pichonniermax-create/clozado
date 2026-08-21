import { asc } from "drizzle-orm";
import { db } from "@/db";
import { dealTypes } from "@/db/schema";
import { orgScope } from "@/db/scope";
import type { OrgScopeUser } from "@/lib/session";

/** Types d'affaire de l'organisation de l'appelant. Aucun défaut seedé : voir deal-statuses.ts pour pourquoi. */
export async function listDealTypes(user: OrgScopeUser) {
  const scope = orgScope(user, dealTypes.organizationId);
  const query = db.select().from(dealTypes).orderBy(asc(dealTypes.position));
  return scope ? query.where(scope) : query;
}
