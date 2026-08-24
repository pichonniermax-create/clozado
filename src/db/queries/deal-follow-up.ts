import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { commissions, dealEvents, dealShares, deals, partners } from "@/db/schema";
import { getOwnOrganizationOrThrow } from "./newsletters";
import type { OrgScopeUser } from "@/lib/session";

/**
 * Le tableau de suivi (écran /suivi) : pas une liste triée par date, trois
 * piles distinctes répondant chacune à « qu'est-ce que je dois relancer
 * aujourd'hui », plus une liste "en cours" (niveau 2) et une liste "clos"
 * (niveau 3, repliée côté écran). Seuils lus depuis `organizations`
 * (jamais en dur ici) — voir schema/organizations.ts pour leurs défauts.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Partagé avec la génération de tâches (queries/tasks.ts) : les deux doivent compter les jours exactement pareil. */
export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

export type FollowUpShare = {
  shareId: string;
  dealId: string;
  dealTitle: string;
  partnerName: string;
  status: "pending" | "accepted" | "declined" | "revoked";
  sentAt: Date;
  respondedAt: Date | null;
  expiresAt: Date | null;
};

export type PendingAlert = FollowUpShare & {
  daysSinceSent: number;
  /** Négatif ou nul = déjà expiré. */
  daysUntilExpiry: number | null;
  /** Rouge : silence ≥ seuil urgent OU expiration à ≤ seuil — le reste (juste signalé) reste neutre. */
  critical: boolean;
};

export type AcceptedStale = FollowUpShare & {
  daysSinceActivity: number;
};

export type UnpaidCommission = {
  commissionId: string;
  shareId: string;
  dealId: string;
  dealTitle: string;
  partnerName: string;
  basis: "percentage" | "fixed";
  rate: string | null;
  fixedAmount: string | null;
  computedAmount: string | null;
  /**
   * Approximation : date de dernière modification de la commission, pas
   * une date de confirmation dédiée (pas de colonne pour ça). Correct tant
   * qu'une commission confirmée n'est pas rééditée sans changer d'état —
   * à revoir si ça devient un vrai problème en usage.
   */
  confirmedAt: Date;
};

export type FollowUpBoard = {
  thresholds: {
    pendingReminderDays: number;
    pendingUrgentDays: number;
    expiringSoonDays: number;
    acceptedStaleDays: number;
  };
  pendingAlerts: PendingAlert[];
  acceptedStale: AcceptedStale[];
  unpaidCommissions: UnpaidCommission[];
  inProgress: FollowUpShare[];
  closed: FollowUpShare[];
};

/**
 * PRÉCONDITION : `user.organizationId` non nul. Ce tableau n'a de sens que
 * rapporté à une organisation (ses seuils, ses partages) ; appelé pour un
 * super_admin sans organisation choisie, il lève un message qui renvoie
 * au bandeau (via getOwnOrganizationOrThrow).
 * Les deux appelants (l'écran /suivi et la coquille (app)/layout.tsx) le
 * vérifient avant d'appeler — c'est ce qui manquait et faisait renvoyer un
 * 500 à /suivi en production.
 */
export async function getFollowUpBoard(user: OrgScopeUser): Promise<FollowUpBoard> {
  const org = await getOwnOrganizationOrThrow(user);
  const now = new Date();

  const thresholds = {
    pendingReminderDays: org.sharePendingReminderDays,
    pendingUrgentDays: org.sharePendingUrgentDays,
    expiringSoonDays: org.shareExpiringSoonDays,
    acceptedStaleDays: org.dealAcceptedStaleDays,
  };

  const rows = await db
    .select({
      shareId: dealShares.id,
      dealId: deals.id,
      dealTitle: deals.title,
      partnerName: partners.name,
      status: dealShares.status,
      sentAt: dealShares.sentAt,
      respondedAt: dealShares.respondedAt,
      expiresAt: dealShares.expiresAt,
    })
    .from(dealShares)
    .innerJoin(deals, eq(dealShares.dealId, deals.id))
    .innerJoin(partners, eq(dealShares.partnerId, partners.id))
    .where(eq(dealShares.organizationId, org.id))
    .orderBy(desc(dealShares.sentAt));

  // Dernière activité (statut changé / commentaire / commission mise à
  // jour) par partage accepté — nécessaire pour la pile B seulement, une
  // requête séparée plutôt qu'une agrégation SQL pour rester lisible.
  const acceptedIds = rows.filter((r) => r.status === "accepted").map((r) => r.shareId);
  const lastActivityByShare = new Map<string, Date>();
  if (acceptedIds.length > 0) {
    const events = await db
      .select({ shareId: dealEvents.shareId, createdAt: dealEvents.createdAt })
      .from(dealEvents)
      .where(
        and(
          inArray(dealEvents.shareId, acceptedIds),
          inArray(dealEvents.type, ["status_changed", "commented", "commission_updated"])
        )
      );
    for (const e of events) {
      if (!e.shareId) continue;
      const current = lastActivityByShare.get(e.shareId);
      if (!current || e.createdAt > current) lastActivityByShare.set(e.shareId, e.createdAt);
    }
  }

  const pendingAlerts: PendingAlert[] = [];
  const acceptedStale: AcceptedStale[] = [];
  const inProgress: FollowUpShare[] = [];
  const closed: FollowUpShare[] = [];

  for (const r of rows) {
    if (r.status === "declined" || r.status === "revoked") {
      closed.push(r);
      continue;
    }

    if (r.status === "pending") {
      const daysSinceSent = daysBetween(r.sentAt, now);
      const daysUntilExpiry = r.expiresAt ? daysBetween(now, r.expiresAt) : null;
      const critical =
        daysSinceSent >= thresholds.pendingUrgentDays ||
        (daysUntilExpiry !== null && daysUntilExpiry <= thresholds.expiringSoonDays);
      const flagged = critical || daysSinceSent >= thresholds.pendingReminderDays;
      if (flagged) {
        pendingAlerts.push({ ...r, daysSinceSent, daysUntilExpiry, critical });
      } else {
        inProgress.push(r);
      }
      continue;
    }

    // status === "accepted"
    const lastActivity = lastActivityByShare.get(r.shareId) ?? r.respondedAt ?? r.sentAt;
    const daysSinceActivity = daysBetween(lastActivity, now);
    if (daysSinceActivity >= thresholds.acceptedStaleDays) {
      acceptedStale.push({ ...r, daysSinceActivity });
    } else {
      inProgress.push(r);
    }
  }

  // Dans chaque pile, le plus sévère en premier — jamais un simple tri par date.
  pendingAlerts.sort((a, b) => {
    if (a.critical !== b.critical) return a.critical ? -1 : 1;
    return b.daysSinceSent - a.daysSinceSent;
  });
  acceptedStale.sort((a, b) => b.daysSinceActivity - a.daysSinceActivity);

  const unpaidCommissions = await db
    .select({
      commissionId: commissions.id,
      shareId: commissions.shareId,
      dealId: deals.id,
      dealTitle: deals.title,
      partnerName: partners.name,
      basis: commissions.basis,
      rate: commissions.rate,
      fixedAmount: commissions.fixedAmount,
      computedAmount: commissions.computedAmount,
      confirmedAt: commissions.updatedAt,
    })
    .from(commissions)
    .innerJoin(deals, eq(commissions.dealId, deals.id))
    .innerJoin(dealShares, eq(commissions.shareId, dealShares.id))
    .innerJoin(partners, eq(dealShares.partnerId, partners.id))
    .where(and(eq(commissions.organizationId, org.id), eq(commissions.state, "confirmee")))
    .orderBy(commissions.updatedAt);

  // "En cours" = niveau 2, TOUT LE RESTE actif — donc jamais ce qui est déjà
  // remonté dans une des trois piles d'action. Les piles A et B sortent
  // naturellement de la boucle ci-dessus (un partage y va OU dans inProgress),
  // mais la pile C est calculée séparément : sans ce filtre, un partage
  // accepté et récemment actif portant une commission confirmée non réglée
  // s'affichait DEUX FOIS sur l'écran — une fois à traiter, une fois en
  // simple constat. C'est exactement la fusion de piles que cet écran refuse.
  const actionableShareIds = new Set(unpaidCommissions.map((c) => c.shareId));
  const inProgressFiltered = inProgress.filter((r) => !actionableShareIds.has(r.shareId));

  return {
    thresholds,
    pendingAlerts,
    acceptedStale,
    unpaidCommissions,
    inProgress: inProgressFiltered,
    closed,
  };
}
