import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  dealEvents,
  dealEventTypeEnum,
  dealShares,
  dealStatuses,
  dealTypes,
  deals,
  organizations,
} from "@/db/schema";
import { toRenderBrand } from "@/db/queries/newsletters";
import { hashShareToken } from "@/lib/deal-shares/token";
import type { RenderBrand } from "@/lib/newsletter/render-email";

/**
 * SEULE EXCEPTION À `orgScope` DE TOUT LE PRODUIT.
 *
 * Aucune fonction de ce fichier n'accepte, ne lit, ni ne dérive un
 * `organizationId`, un rôle ou une session utilisateur en entrée. La seule
 * entrée possible est un jeton opaque (`token: string`) présenté par un
 * appelant anonyme. Toute donnée renvoyée — affaire, marque, statuts,
 * événements — est résolue en repartant UNIQUEMENT des colonnes
 * `deal_id`/`partner_id`/`organization_id` de LA LIGNE `deal_shares`
 * trouvée pour ce jeton, jamais d'une recherche plus large.
 *
 * Toute autre requête sur `deals`/`partners` dans ce produit doit passer
 * par `orgScope`/`assertOrgAccess` (src/db/scope.ts) — jamais par ce
 * fichier, et ce fichier ne doit jamais être appelé depuis une route qui a
 * une session utilisateur en contexte.
 *
 * Ce que ce module refuse, explicitement :
 * - un jeton inconnu (mauvais hash, faute de frappe, pure invention) ;
 * - un partage révoqué (`status = 'revoked'`) ;
 * - un partage expiré, évalué à CHAQUE appel via `expires_at` — jamais un
 *   statut stocké, jamais dépendant d'une tâche de fond ;
 * - un changement de statut vers un `deal_statuses.id` qui n'appartient pas
 *   à l'organisation de CE partage précis (revérifié ici, pas seulement
 *   laissé à la FK composite) ;
 * - accepter/refuser un partage déjà résolu (idempotence explicite, pas un
 *   nouvel accepté/refusé silencieux qui écraserait la réponse d'origine).
 *
 * Ce que ce module renvoie, et RIEN D'AUTRE : voir `PublicShareView` —
 * jamais `organization_id` brut, jamais un email/id d'utilisateur interne,
 * jamais les autres affaires/partenaires/partages de l'organisation.
 */

export type PublicShareStatus = "pending" | "accepted" | "declined" | "revoked";

export type PublicShareView = {
  shareId: string;
  status: PublicShareStatus;
  deal: {
    title: string;
    clientName: string;
    typeLabel: string;
    estimatedAmount: string | null;
    description: string | null;
  };
  proposedTerms: string | null;
  message: string | null;
  brand: RenderBrand;
  currentDealStatus: { id: string; label: string; color: string | null };
  /** Statuts proposables au changement — appartiennent tous à l'organisation de CE partage, rien d'autre. */
  availableStatuses: { id: string; label: string; color: string | null }[];
  /**
   * Journal filtré sur CE `share_id` uniquement — jamais les événements
   * d'un autre partage de la même affaire (un deal peut être partagé à
   * plusieurs partenaires ; chacun ne voit que son propre fil). `actor` est
   * une étiquette générique, jamais un nom/email d'utilisateur interne.
   */
  events: {
    id: string;
    type: string;
    message: string | null;
    createdAt: string;
    actor: "vous" | "organisation";
  }[];
};

export type ResolvedShare =
  | { ok: true; view: PublicShareView }
  | { ok: false; reason: "not_found" | "revoked" | "expired" | "already_resolved" };

type DealShareRow = typeof dealShares.$inferSelect;

/** Lecture seule : résout un jeton en la vue minimale du partage, ou en un motif de refus. */
export async function resolvePublicShare(token: string): Promise<ResolvedShare> {
  const share = await findShareByToken(token);
  if (!share) return { ok: false, reason: "not_found" };

  const rejection = await checkAccessible(share);
  if (rejection) return rejection;

  return { ok: true, view: await buildView(share) };
}

export type PublicShareAction =
  | { type: "accept" }
  | { type: "decline" }
  | { type: "status_change"; statusId: string }
  | { type: "comment"; message: string };

/** Écriture : ré-résout le jeton à CHAQUE appel (jamais un état mis en cache côté appelant) puis applique l'action. */
export async function applyPublicShareAction(
  token: string,
  action: PublicShareAction
): Promise<ResolvedShare> {
  const share = await findShareByToken(token);
  if (!share) return { ok: false, reason: "not_found" };

  const rejection = await checkAccessible(share);
  if (rejection) return rejection;

  if (action.type === "accept" || action.type === "decline") {
    if (share.status !== "pending") {
      return { ok: false, reason: "already_resolved" };
    }
    await db
      .update(dealShares)
      .set({
        status: action.type === "accept" ? "accepted" : "declined",
        respondedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(dealShares.id, share.id));
    await logEvent(share, action.type === "accept" ? "share_accepted" : "share_declined", null);
  }

  if (action.type === "status_change") {
    // Revérifié ici en plus de la FK composite en base : le statut soumis
    // doit appartenir à l'organisation de CE partage, jamais un id d'une
    // autre organisation — même si l'attaquant connaît un id de statut
    // valide ailleurs, il ne peut rien en faire via ce jeton.
    const status = await db.query.dealStatuses.findFirst({
      where: eq(dealStatuses.id, action.statusId),
    });
    if (!status || status.organizationId !== share.organizationId) {
      throw new Error("Statut invalide pour ce partage.");
    }
    await db
      .update(deals)
      .set({ statusId: status.id, updatedAt: new Date() })
      .where(eq(deals.id, share.dealId));
    await logEvent(share, "status_changed", status.label);
  }

  if (action.type === "comment") {
    const message = action.message.trim().slice(0, 2000);
    if (!message) throw new Error("Commentaire vide.");
    await logEvent(share, "commented", message);
  }

  const refreshed = await db.query.dealShares.findFirst({ where: eq(dealShares.id, share.id) });
  if (!refreshed) throw new Error("Incohérence interne : partage disparu pendant l'action.");
  return { ok: true, view: await buildView(refreshed) };
}

/** Unique point d'entrée de résolution — hash le jeton, une seule requête indexée sur `token_hash`. */
async function findShareByToken(token: string): Promise<DealShareRow | null> {
  const tokenHash = hashShareToken(token);
  const share = await db.query.dealShares.findFirst({ where: eq(dealShares.tokenHash, tokenHash) });
  return share ?? null;
}

/** Révocation et expiration — expiration évaluée ICI, à chaque appel, jamais lue depuis un statut stocké. */
async function checkAccessible(share: DealShareRow): Promise<ResolvedShare | null> {
  if (share.status === "revoked") {
    return { ok: false, reason: "revoked" };
  }
  if (share.expiresAt && share.expiresAt.getTime() < Date.now()) {
    // Constat journalisé (trace d'accès), PAS une mutation de `status`.
    await logEvent(share, "share_expired", null);
    return { ok: false, reason: "expired" };
  }
  return null;
}

/**
 * Construit la vue minimale à partir d'UNE ligne `deal_shares` déjà
 * résolue et validée. Chaque sous-requête ci-dessous est bornée par un id
 * qui vient de `share` lui-même (`share.dealId`, `share.organizationId`,
 * `share.id`) — jamais par un id fourni ailleurs.
 */
async function buildView(share: DealShareRow): Promise<PublicShareView> {
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, share.dealId) });
  if (!deal) throw new Error("Incohérence interne : affaire introuvable pour un partage valide.");

  const [type, org, currentStatus, availableStatuses, events] = await Promise.all([
    db.query.dealTypes.findFirst({ where: eq(dealTypes.id, deal.typeId) }),
    db.query.organizations.findFirst({ where: eq(organizations.id, share.organizationId) }),
    db.query.dealStatuses.findFirst({ where: eq(dealStatuses.id, deal.statusId) }),
    db
      .select()
      .from(dealStatuses)
      .where(eq(dealStatuses.organizationId, share.organizationId))
      .orderBy(asc(dealStatuses.position)),
    db
      .select()
      .from(dealEvents)
      .where(
        and(eq(dealEvents.shareId, share.id), inArray(dealEvents.type, ["commented", "status_changed"]))
      )
      .orderBy(asc(dealEvents.createdAt)),
  ]);

  if (!org || !currentStatus) {
    throw new Error("Incohérence interne : organisation ou statut introuvable pour un partage valide.");
  }

  return {
    shareId: share.id,
    status: share.status,
    deal: {
      title: deal.title,
      clientName: deal.clientName,
      typeLabel: type?.label ?? "—",
      estimatedAmount: deal.estimatedAmount,
      description: deal.description,
    },
    proposedTerms: share.proposedTerms,
    message: share.message,
    brand: toRenderBrand(org),
    currentDealStatus: {
      id: currentStatus.id,
      label: currentStatus.label,
      color: currentStatus.color,
    },
    availableStatuses: availableStatuses.map((s) => ({ id: s.id, label: s.label, color: s.color })),
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      message: e.message,
      createdAt: e.createdAt.toISOString(),
      actor: e.actorPartnerId ? "vous" : "organisation",
    })),
  };
}

async function logEvent(
  share: DealShareRow,
  type: (typeof dealEventTypeEnum.enumValues)[number],
  message: string | null
) {
  await db.insert(dealEvents).values({
    organizationId: share.organizationId,
    dealId: share.dealId,
    shareId: share.id,
    type,
    message,
    // Acteur = le partenaire de CE partage, jamais un utilisateur interne :
    // seul un porteur du jeton peut déclencher ce chemin de code.
    actorPartnerId: share.partnerId,
  });
}
