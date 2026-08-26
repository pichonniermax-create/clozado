import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { lossReasons } from "@/db/schema";
import { assertOrgAccess, orgScope } from "@/db/scope";
import type { OrgScopeUser } from "@/lib/session";
import { AppError } from "@/lib/errors";

/** Motifs de perte de l'organisation, dans leur ordre d'affichage. */
export async function listLossReasons(user: OrgScopeUser) {
  const scope = orgScope(user, lossReasons.organizationId);
  const query = db.select().from(lossReasons).orderBy(asc(lossReasons.position), asc(lossReasons.label));
  return scope ? query.where(scope) : query;
}

export async function createLossReason(user: OrgScopeUser, label: string) {
  if (!user.organizationId) {
    throw new AppError("aucune_organisation_selectionnee_choisis_une_organisation_dans_643f");
  }
  const trimmed = label.trim();
  if (!trimmed) throw new AppError("le_libelle_du_motif_est_obligatoire");
  const [reason] = await db
    .insert(lossReasons)
    .values({ organizationId: user.organizationId, label: trimmed })
    .onConflictDoNothing()
    .returning();
  return reason ?? null;
}

/**
 * Suppression permise tant qu'aucune affaire ne le référence — la FK
 * (NO ACTION) refuse sinon, et on le dit honnêtement.
 */
export async function deleteLossReason(user: OrgScopeUser, id: string) {
  const reason = await db.query.lossReasons.findFirst({ where: eq(lossReasons.id, id) });
  if (!reason) return;
  assertOrgAccess(user, reason.organizationId);
  try {
    await db.delete(lossReasons).where(eq(lossReasons.id, id));
  } catch {
    throw new AppError("ce_motif_est_utilise_par_au_moins_f119");
  }
}
