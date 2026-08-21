import { asc, eq } from "drizzle-orm";
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

function slugify(label: string): string {
  const base = label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || "type";
}

/**
 * Créé à la volée depuis l'écran affaires quand l'organisation n'a pas
 * encore configuré ses types. Un suffixe garantit l'unicité du slug par
 * organisation sans requête supplémentaire — le slug n'est jamais affiché,
 * seul `label` l'est.
 */
export async function createDealType(user: OrgScopeUser, label: string) {
  if (!user.organizationId) {
    throw new Error("Aucune organisation associée à cet utilisateur.");
  }
  const trimmed = label.trim();
  if (!trimmed) throw new Error("Libellé requis.");

  const existing = await db
    .select()
    .from(dealTypes)
    .where(eq(dealTypes.organizationId, user.organizationId));

  const [type] = await db
    .insert(dealTypes)
    .values({
      organizationId: user.organizationId,
      slug: `${slugify(trimmed)}_${Date.now().toString(36)}`,
      label: trimmed,
      position: existing.length,
    })
    .returning();
  return type;
}
