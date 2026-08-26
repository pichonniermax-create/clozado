import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  commissions,
  dealEvents,
  dealEventTypeEnum,
  dealShares,
  dealStatuses,
  dealTypes,
  deals,
  organizations,
  partners,
  dealStageChanges,
  users,
} from "@/db/schema";
import { toRenderBrand } from "@/db/queries/newsletters";
import { listOrganizationAssetMeta } from "@/db/queries/organization-assets";
import { assetUrlsFromMeta } from "@/lib/brand/assets";
import { hashShareToken } from "@/lib/deal-shares/token";
import type { RenderBrand } from "@/lib/newsletter/render-email";
import { AppError } from "@/lib/errors";

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
  /** Qui écrit : nom de l'organisation ET de la personne qui a envoyé CE partage — jamais un email, jamais un id. */
  organization: { name: string; defaultLocale: string; currency: string; timezone: string };
  issuedByName: string | null;
  /** Nom complet du partenaire destinataire — la page en dérive le prénom pour "Bonjour {prénom}". */
  partnerName: string;
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
  /** L'icône d'onglet de l'organisation (image téléversée, adresse versionnée), ou null : la page porte sa marque jusque dans l'onglet. */
  iconUrl: string | null;
  /** NULL = pas d'expiration. Toujours annoncée sur la page, jamais découverte au moment où le lien ne marche plus. */
  expiresAt: string | null;
  /** Renseignée dès accepted/declined — la date qui fait foi si les conditions sont contestées. */
  respondedAt: string | null;
  currentDealStatus: { id: string; label: string; color: string | null };
  /** Statuts proposables au changement — appartiennent tous à l'organisation de CE partage, rien d'autre. */
  availableStatuses: { id: string; label: string; color: string | null }[];
  /**
   * NULL tant qu'aucune commission n'a été formalisée pour ce partage —
   * l'affichage doit rester silencieux dans ce cas (niveau 3, conditionnel).
   */
  commission: {
    basis: "percentage" | "fixed";
    rate: string | null;
    fixedAmount: string | null;
    computedAmount: string | null;
    state: "prevue" | "confirmee" | "reglee";
  } | null;
  /**
   * Journal filtré sur CE `share_id` uniquement — jamais les événements
   * d'un autre partage de la même affaire (un deal peut être partagé à
   * plusieurs partenaires ; chacun ne voit que son propre fil). `actor` est
   * une étiquette générique, jamais un nom/email d'utilisateur interne —
   * contrairement à `issuedByName` ci-dessus (une seule identité connue et
   * spécifique à ce partage), l'historique peut mêler plusieurs personnes
   * internes au fil du temps, jamais nommées individuellement ici.
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

/**
 * Résout un jeton en la vue minimale du partage, ou en un motif de refus.
 * Journalise la PREMIÈRE consultation (`share_viewed`, attribuée au
 * partenaire) — une seule fois par partage : c'est la date qui compte pour
 * « envoyé → consulté », les suivantes n'apprennent rien.
 */
export async function resolvePublicShare(token: string): Promise<ResolvedShare> {
  const share = await findShareByToken(token);
  if (!share) return { ok: false, reason: "not_found" };

  const rejection = await checkAccessible(share);
  if (rejection) return rejection;

  await logFirstView(share);
  return { ok: true, view: await buildView(share) };
}

async function logFirstView(share: DealShareRow) {
  const [seen] = await db
    .select({ id: dealEvents.id })
    .from(dealEvents)
    .where(and(eq(dealEvents.shareId, share.id), eq(dealEvents.type, "share_viewed")))
    .limit(1);
  if (seen) return;
  await logEvent(share, "share_viewed", null);
}

export type PublicShareAction =
  | { type: "accept" }
  | { type: "decline"; reason?: string }
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
    const declineReason = action.type === "decline" ? (action.reason?.trim().slice(0, 500) ?? null) : null;
    await logEvent(
      share,
      action.type === "accept" ? "share_accepted" : "share_declined",
      action.type === "accept" ? null : declineReason || null
    );
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
      throw new AppError("statut_invalide_pour_ce_partage");
    }
    const deal = await db.query.deals.findFirst({ where: eq(deals.id, share.dealId) });
    if (!deal) throw new AppError("incoherence_interne_affaire_introuvable_pour_un_partage_6423", undefined, 404);
    // Même pipeline seulement, et JAMAIS une étape gagné/perdu : clore une
    // affaire est un geste de l'organisation, pas d'un tiers via jeton
    // (décision A, docs/module-relationnel.md). Ces étapes ne sont pas
    // proposées par buildView — ce refus couvre une soumission forgée.
    if (status.pipelineId !== deal.pipelineId || status.outcome !== null) {
      throw new AppError("statut_invalide_pour_ce_partage");
    }
    if (deal.statusId !== status.id) {
      await db.batch([
        db
          .update(deals)
          .set({ statusId: status.id, updatedAt: new Date() })
          .where(eq(deals.id, share.dealId)),
        // L'historique structuré (durées par étape) attribue le geste au
        // PARTENAIRE — même règle d'attribution que deal_events.
        db.insert(dealStageChanges).values({
          organizationId: share.organizationId,
          dealId: share.dealId,
          fromStatusId: deal.statusId,
          toStatusId: status.id,
          actorPartnerId: share.partnerId,
        }),
      ]);
    }
    await logEvent(share, "status_changed", status.label);
  }

  if (action.type === "comment") {
    const message = action.message.trim().slice(0, 2000);
    if (!message) throw new AppError("commentaire_vide");
    await logEvent(share, "commented", message);
  }

  const refreshed = await db.query.dealShares.findFirst({ where: eq(dealShares.id, share.id) });
  if (!refreshed) throw new AppError("incoherence_interne_partage_disparu_pendant_l_action", undefined, 404);
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
  if (!deal) throw new AppError("incoherence_interne_affaire_introuvable_pour_un_partage_6423", undefined, 404);

  const [type, org, partner, issuer, currentStatus, availableStatuses, commission, events, assetMeta] =
    await Promise.all([
      db.query.dealTypes.findFirst({ where: eq(dealTypes.id, deal.typeId) }),
      db.query.organizations.findFirst({ where: eq(organizations.id, share.organizationId) }),
      db.query.partners.findFirst({ where: eq(partners.id, share.partnerId) }),
      share.createdBy
        ? db.query.users.findFirst({ where: eq(users.id, share.createdBy) })
        : Promise.resolve(undefined),
      db.query.dealStatuses.findFirst({ where: eq(dealStatuses.id, deal.statusId) }),
      db
        .select()
        .from(dealStatuses)
        .where(
          and(
            eq(dealStatuses.organizationId, share.organizationId),
            // Les étapes du pipeline de CETTE affaire, hors gagné/perdu :
            // clore reste un geste de l'organisation (décision A).
            eq(dealStatuses.pipelineId, deal.pipelineId),
            isNull(dealStatuses.outcome)
          )
        )
        .orderBy(asc(dealStatuses.position)),
      // Bornée par share.id : jamais la commission d'un autre partage.
      db.query.commissions.findFirst({ where: eq(commissions.shareId, share.id) }),
      db
        .select()
        .from(dealEvents)
        .where(
          and(
            eq(dealEvents.shareId, share.id),
            inArray(dealEvents.type, ["commented", "status_changed", "share_accepted", "share_declined"])
          )
        )
        .orderBy(asc(dealEvents.createdAt)),
      // Bornée par share.organizationId, comme tout le reste : les images de CETTE organisation.
      listOrganizationAssetMeta(share.organizationId),
    ]);

  if (!org || !partner || !currentStatus) {
    throw new AppError("incoherence_interne_organisation_partenaire_ou_statut_introuvable_5be3", undefined, 404);
  }
  const brandUrls = assetUrlsFromMeta(org.id, assetMeta);

  return {
    shareId: share.id,
    status: share.status,
    organization: { name: org.name, defaultLocale: org.defaultLocale, currency: org.currency, timezone: org.timezone },
    issuedByName: issuer?.name ?? null,
    partnerName: partner.name,
    deal: {
      title: deal.title,
      clientName: deal.clientName,
      typeLabel: type?.label ?? "—",
      estimatedAmount: deal.estimatedAmount,
      description: deal.description,
    },
    proposedTerms: share.proposedTerms,
    message: share.message,
    brand: toRenderBrand(org, assetMeta),
    iconUrl: brandUrls.icon ?? null,
    expiresAt: share.expiresAt ? share.expiresAt.toISOString() : null,
    respondedAt: share.respondedAt ? share.respondedAt.toISOString() : null,
    currentDealStatus: {
      id: currentStatus.id,
      label: currentStatus.label,
      color: currentStatus.color,
    },
    availableStatuses: availableStatuses.map((s) => ({ id: s.id, label: s.label, color: s.color })),
    commission: commission
      ? {
          basis: commission.basis,
          rate: commission.rate,
          fixedAmount: commission.fixedAmount,
          computedAmount: commission.computedAmount,
          state: commission.state,
        }
      : null,
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
