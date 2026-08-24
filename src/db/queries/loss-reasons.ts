import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { lossReasons } from "@/db/schema";
import { assertOrgAccess, orgScope } from "@/db/scope";
import type { OrgScopeUser } from "@/lib/session";

/** Motifs de perte de l'organisation, dans leur ordre d'affichage. */
export async function listLossReasons(user: OrgScopeUser) {
  const scope = orgScope(user, lossReasons.organizationId);
  const query = db.select().from(lossReasons).orderBy(asc(lossReasons.position), asc(lossReasons.label));
  return scope ? query.where(scope) : query;
}

export async function createLossReason(user: OrgScopeUser, label: string) {
  if (!user.organizationId) {
    throw new Error(
      "Aucune organisation sélectionnée. Choisis une organisation dans le bandeau super admin en haut de l'écran avant de créer un motif de perte."
    );
  }
  const trimmed = label.trim();
  if (!trimmed) throw new Error("Le libellé du motif est obligatoire.");
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
    throw new Error(
      "Ce motif est utilisé par au moins une affaire : il ne peut plus être supprimé. Renomme-le si son libellé ne convient plus."
    );
  }
}
