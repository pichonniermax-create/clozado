import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { dealStatuses } from "@/db/schema";
import { orgScope } from "@/db/scope";
import type { OrgScopeUser } from "@/lib/session";

/** Statuts d'affaire de l'organisation de l'appelant, dans leur ordre d'affichage. */
export async function listDealStatuses(user: OrgScopeUser) {
  const scope = orgScope(user, dealStatuses.organizationId);
  const query = db.select().from(dealStatuses).orderBy(asc(dealStatuses.position));
  return scope ? query.where(scope) : query;
}

/**
 * Valeurs par défaut créées à la création d'une organisation — pas un
 * contenu figé dans le code applicatif au-delà de cet instant : modifiable
 * ensuite comme n'importe quelle ligne de `deal_statuses`. Volontairement
 * PAS d'équivalent pour `deal_types` : un CGP et un courtier crédit n'ont
 * rien en commun sur ce vocabulaire, deviner un défaut serait arbitraire.
 */
const DEFAULT_STATUSES = [
  { slug: "nouveau", label: "Nouveau", color: "#64748b" },
  { slug: "partagee", label: "Partagée", color: "#2563eb" },
  { slug: "en_negociation", label: "En négociation", color: "#d97706" },
  { slug: "acceptee", label: "Acceptée", color: "#16a34a" },
  { slug: "perdue", label: "Perdue", color: "#dc2626" },
] as const;

/** À appeler une fois, à la création d'une organisation. */
export async function seedDefaultDealStatuses(organizationId: string) {
  await db
    .insert(dealStatuses)
    .values(DEFAULT_STATUSES.map((s, position) => ({ organizationId, position, ...s })));
}

/** Le statut par défaut ("nouveau") d'une organisation, utilisé à la création d'une affaire. */
export async function getDefaultDealStatus(organizationId: string) {
  const status = await db.query.dealStatuses.findFirst({
    where: and(eq(dealStatuses.organizationId, organizationId), eq(dealStatuses.slug, "nouveau")),
  });
  if (!status) {
    throw new Error('Statut par défaut ("nouveau") introuvable pour cette organisation.');
  }
  return status;
}
