import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { dealEvents, dealShares, deals, partners, users } from "@/db/schema";
import { assertOrgAccess } from "@/db/scope";
import type { OrgScopeUser } from "@/lib/session";

/**
 * Journal interne d'une affaire — contrairement à la vue partenaire
 * (`deal-shares-public.ts`, filtrée sur un seul `share_id`, types limités,
 * acteurs anonymisés), celle-ci montre TOUS les partages de l'affaire et
 * nomme les acteurs : c'est un écran interne, pas la page vue par un
 * tiers.
 */

export type DealEventRow = {
  id: string;
  type: string;
  message: string | null;
  createdAt: Date;
  /** Le partenaire du partage concerné par l'événement, pour contexte — null pour un événement sans share_id. */
  sharePartnerName: string | null;
  /** Nom de la personne interne, ou nom du partenaire si c'est lui l'acteur, ou "Système" si aucun des deux (ex: expiration constatée). */
  actorLabel: string;
};

export async function listDealEvents(user: OrgScopeUser, dealId: string): Promise<DealEventRow[]> {
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  if (!deal) throw new Error("Affaire introuvable.");
  assertOrgAccess(user, deal.organizationId);

  const actorPartner = alias(partners, "actor_partner");
  const sharePartner = alias(partners, "share_partner");

  const rows = await db
    .select({
      id: dealEvents.id,
      type: dealEvents.type,
      message: dealEvents.message,
      createdAt: dealEvents.createdAt,
      actorUserId: dealEvents.actorUserId,
      actorUserName: users.name,
      actorPartnerId: dealEvents.actorPartnerId,
      actorPartnerName: actorPartner.name,
      sharePartnerName: sharePartner.name,
    })
    .from(dealEvents)
    .leftJoin(users, eq(dealEvents.actorUserId, users.id))
    .leftJoin(actorPartner, eq(dealEvents.actorPartnerId, actorPartner.id))
    .leftJoin(dealShares, eq(dealEvents.shareId, dealShares.id))
    .leftJoin(sharePartner, eq(dealShares.partnerId, sharePartner.id))
    .where(eq(dealEvents.dealId, dealId))
    .orderBy(asc(dealEvents.createdAt));

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    message: r.message,
    createdAt: r.createdAt,
    sharePartnerName: r.sharePartnerName,
    // Distingue "aucun acteur" (les deux id NULL, ex: expiration constatée)
    // d'un acteur réel dont le nom n'est pas renseigné (name nullable sur
    // users) — dans ce dernier cas jamais "Système", qui laisserait croire
    // à un événement automatique.
    actorLabel: r.actorUserId
      ? (r.actorUserName ?? "Utilisateur")
      : r.actorPartnerId
        ? `${r.actorPartnerName} (partenaire)`
        : "Système",
  }));
}
