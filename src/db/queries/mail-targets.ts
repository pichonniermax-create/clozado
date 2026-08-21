import { asc } from "drizzle-orm";
import { db } from "@/db";
import { mailTargets } from "@/db/schema";
import { orgScope } from "@/db/scope";
import type { OrgScopeUser } from "@/lib/session";

/** Cibles/personas de l'organisation de l'appelant, pour peupler le sélecteur du composer. */
export async function listMailTargets(user: OrgScopeUser) {
  const scope = orgScope(user, mailTargets.organizationId);
  const query = db.select().from(mailTargets).orderBy(asc(mailTargets.position));
  return scope ? query.where(scope) : query;
}
