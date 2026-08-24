import { randomUUID } from "crypto";
import { and, asc, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  contacts,
  dealEvents,
  deals,
  dealStageChanges,
  dealStatuses,
  dealTypes,
  lossReasons,
  users,
} from "@/db/schema";
import { assertOrgAccess, orgScope } from "@/db/scope";
import { getDefaultDealStatus } from "./deal-statuses";
import type { OrgScopeUser } from "@/lib/session";

/** Affaires de l'organisation de l'appelant, plus récentes d'abord, avec libellé de type/statut pour l'affichage. */
export async function listDeals(user: OrgScopeUser) {
  const scope = orgScope(user, deals.organizationId);
  const query = db
    .select({
      deal: deals,
      typeLabel: dealTypes.label,
      statusLabel: dealStatuses.label,
      statusColor: dealStatuses.color,
    })
    .from(deals)
    .innerJoin(dealTypes, eq(deals.typeId, dealTypes.id))
    .innerJoin(dealStatuses, eq(deals.statusId, dealStatuses.id))
    .orderBy(desc(deals.updatedAt));
  return scope ? query.where(scope) : query;
}

export async function getDeal(user: OrgScopeUser, id: string) {
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, id) });
  if (!deal) return null;
  assertOrgAccess(user, deal.organizationId);
  return deal;
}

export type CreateDealInput = {
  title: string;
  clientName: string;
  typeId: string;
  /** Statut initial optionnel — si absent, le statut "nouveau" de l'organisation est utilisé. */
  statusId?: string;
  /** Fiche contact à relier (facultatif) — le nom du client est alors copié depuis la fiche si absent. */
  contactId?: string | null;
  estimatedAmount?: string | null;
  description?: string | null;
};

export async function createDeal(
  user: OrgScopeUser,
  createdBy: string,
  input: CreateDealInput
) {
  if (!user.organizationId) {
    throw new Error(
      "Aucune organisation sélectionnée. Choisis une organisation dans le bandeau super admin en haut de l'écran avant de créer une affaire."
    );
  }

  // Le type doit exister ET appartenir à cette organisation — vérifié ici
  // en plus de la FK composite en base (message d'erreur clair côté
  // application plutôt qu'une simple violation de contrainte SQL).
  const type = await db.query.dealTypes.findFirst({ where: eq(dealTypes.id, input.typeId) });
  if (!type || type.organizationId !== user.organizationId) {
    throw new Error("Type d'affaire introuvable pour cette organisation.");
  }

  // Le statut résolu porte aussi le pipeline : une affaire naît TOUJOURS
  // dans le pipeline de son statut initial (FK composite en base).
  let status;
  if (input.statusId) {
    status = await db.query.dealStatuses.findFirst({ where: eq(dealStatuses.id, input.statusId) });
    if (!status || status.organizationId !== user.organizationId) {
      throw new Error("Statut introuvable pour cette organisation.");
    }
  } else {
    status = await getDefaultDealStatus(user.organizationId);
  }

  let clientName = input.clientName.trim();
  if (input.contactId) {
    const contact = await db.query.contacts.findFirst({ where: eq(contacts.id, input.contactId) });
    if (!contact || contact.organizationId !== user.organizationId) {
      throw new Error("Fiche contact introuvable pour cette organisation.");
    }
    if (contact.deletedAt) {
      throw new Error("Cette fiche contact a été supprimée : elle ne peut plus porter d'affaire.");
    }
    if (!clientName) clientName = contact.name;
  }

  // Id généré côté application : l'affaire, sa première ligne d'historique
  // d'étape et son événement de création naissent dans le MÊME lot atomique
  // (un batch neon-http ne lit pas de returning).
  const dealId = randomUUID();
  await db.batch([
    db.insert(deals).values({
      id: dealId,
      organizationId: user.organizationId,
      title: input.title,
      clientName,
      contactId: input.contactId ?? null,
      typeId: input.typeId,
      statusId: status.id,
      pipelineId: status.pipelineId,
      estimatedAmount: input.estimatedAmount ?? null,
      description: input.description ?? null,
      createdBy,
    }),
    db.insert(dealStageChanges).values({
      organizationId: user.organizationId,
      dealId,
      fromStatusId: null,
      toStatusId: status.id,
      actorUserId: createdBy,
    }),
    db.insert(dealEvents).values({
      organizationId: user.organizationId,
      dealId,
      type: "deal_created",
      message: status.label,
      actorUserId: createdBy,
    }),
  ]);
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  return deal!;
}

/**
 * LE geste du pipeline : déplacer une affaire vers une étape. Trois
 * écritures atomiques — l'affaire, la ligne d'historique structurée
 * (deal_stage_changes, ce qui permet les durées), l'événement du journal
 * (deal_events, ce qui raconte). Le motif de perte n'a de sens que vers
 * une étape perdue ; quitter une étape perdue l'efface.
 */
export async function changeDealStage(
  user: OrgScopeUser,
  actorUserId: string,
  dealId: string,
  statusId: string,
  lossReasonId?: string | null
) {
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  if (!deal) throw new Error("Affaire introuvable.");
  assertOrgAccess(user, deal.organizationId);
  if (deal.statusId === statusId) return deal;

  const status = await db.query.dealStatuses.findFirst({ where: eq(dealStatuses.id, statusId) });
  if (!status || status.organizationId !== deal.organizationId) {
    throw new Error("Étape introuvable pour cette organisation.");
  }
  // La FK composite deals_status_pipeline_fk le refuserait de toute façon —
  // ici pour l'erreur claire. Changer de pipeline sera un geste dédié,
  // jamais un effet de bord d'un changement d'étape.
  if (status.pipelineId !== deal.pipelineId) {
    throw new Error("Cette étape appartient à un autre pipeline que celui de l'affaire.");
  }

  let reasonId: string | null = null;
  if (status.outcome === "lost" && lossReasonId) {
    const reason = await db.query.lossReasons.findFirst({ where: eq(lossReasons.id, lossReasonId) });
    if (!reason || reason.organizationId !== deal.organizationId) {
      throw new Error("Motif de perte introuvable pour cette organisation.");
    }
    reasonId = reason.id;
  }

  const lossReasonAtChange = status.outcome === "lost" ? (reasonId ?? deal.lossReasonId) : null;
  await db.batch([
    db
      .update(deals)
      .set({
        statusId: status.id,
        lossReasonId: lossReasonAtChange,
        updatedAt: new Date(),
      })
      .where(eq(deals.id, dealId)),
    db.insert(dealStageChanges).values({
      organizationId: deal.organizationId,
      dealId,
      fromStatusId: deal.statusId,
      toStatusId: status.id,
      actorUserId,
      // Le motif AU MOMENT de la perte, historisé avec le passage (module
      // analytique, correction 4) — deals.loss_reason_id n'est que courant.
      lossReasonId: lossReasonAtChange,
    }),
    db.insert(dealEvents).values({
      organizationId: deal.organizationId,
      dealId,
      type: "status_changed",
      message: status.label,
      actorUserId,
    }),
  ]);
  return { ...deal, statusId: status.id };
}

export type DealDetailsInput = {
  estimatedAmount?: string | null;
  /** Dérogation à la probabilité de l'étape — NULL = celle de l'étape. */
  probability?: string | null;
  expectedCloseDate?: string | null;
  ownerId?: string | null;
  /** Pris en compte seulement si l'étape courante est marquée perdue. */
  lossReasonId?: string | null;
};

export async function updateDealDetails(user: OrgScopeUser, dealId: string, input: DealDetailsInput) {
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  if (!deal) throw new Error("Affaire introuvable.");
  assertOrgAccess(user, deal.organizationId);

  if (input.ownerId) {
    const owner = await db.query.users.findFirst({ where: eq(users.id, input.ownerId) });
    if (!owner || owner.organizationId !== deal.organizationId) {
      throw new Error("Ce conseiller n'appartient pas à l'organisation de l'affaire.");
    }
  }
  let lossReasonId = deal.lossReasonId;
  if (input.lossReasonId !== undefined) {
    if (input.lossReasonId) {
      const reason = await db.query.lossReasons.findFirst({ where: eq(lossReasons.id, input.lossReasonId) });
      if (!reason || reason.organizationId !== deal.organizationId) {
        throw new Error("Motif de perte introuvable pour cette organisation.");
      }
      lossReasonId = reason.id;
    } else {
      lossReasonId = null;
    }
  }

  const [updated] = await db
    .update(deals)
    .set({
      estimatedAmount: input.estimatedAmount === undefined ? deal.estimatedAmount : input.estimatedAmount,
      probability: input.probability === undefined ? deal.probability : input.probability,
      expectedCloseDate:
        input.expectedCloseDate === undefined ? deal.expectedCloseDate : input.expectedCloseDate,
      ownerId: input.ownerId === undefined ? deal.ownerId : input.ownerId,
      lossReasonId,
      updatedAt: new Date(),
    })
    .where(eq(deals.id, dealId))
    .returning();

  // Le motif corrigé tant que l'affaire est dans l'étape perdue se reporte
  // sur le passage qui l'y a menée : l'historique dit le motif de CETTE
  // perte, pas seulement la valeur courante.
  if (input.lossReasonId !== undefined && lossReasonId !== deal.lossReasonId) {
    const latest = await db
      .select({ id: dealStageChanges.id })
      .from(dealStageChanges)
      .where(and(eq(dealStageChanges.dealId, dealId), eq(dealStageChanges.toStatusId, deal.statusId)))
      .orderBy(desc(dealStageChanges.changedAt))
      .limit(1);
    if (latest[0]) {
      await db
        .update(dealStageChanges)
        .set({ lossReasonId })
        .where(eq(dealStageChanges.id, latest[0].id));
    }
  }
  return updated;
}

// ---------------------------------------------------------------------------
// Vues du pipeline
// ---------------------------------------------------------------------------

/** Toutes les cartes d'un pipeline (kanban) — une requête, le groupage par étape se fait à l'affichage. */
export async function listDealsBoard(user: OrgScopeUser, pipelineId: string) {
  const scope = orgScope(user, deals.organizationId);
  const owner = users;
  return db
    .select({
      id: deals.id,
      title: deals.title,
      clientName: deals.clientName,
      statusId: deals.statusId,
      estimatedAmount: deals.estimatedAmount,
      probability: deals.probability,
      expectedCloseDate: deals.expectedCloseDate,
      lossReasonId: deals.lossReasonId,
      updatedAt: deals.updatedAt,
      ownerName: owner.name,
      contactId: deals.contactId,
    })
    .from(deals)
    .leftJoin(owner, eq(deals.ownerId, owner.id))
    .where(and(eq(deals.pipelineId, pipelineId), scope ?? undefined))
    .orderBy(desc(deals.updatedAt));
}

export const DEALS_PAGE_SIZE = 50;

export type DealsTableSort = "title" | "amount" | "close" | "stage" | "updated";

export type DealsTableOptions = {
  pipelineId: string;
  statusId?: string;
  ownerId?: string;
  sort?: DealsTableSort;
  dir?: "asc" | "desc";
  page?: number;
};

/** La liste dense : triable, filtrable, paginée côté serveur. */
export async function listDealsTable(user: OrgScopeUser, opts: DealsTableOptions) {
  const page = Math.max(1, opts.page ?? 1);
  const conditions: (SQL | undefined)[] = [
    orgScope(user, deals.organizationId),
    eq(deals.pipelineId, opts.pipelineId),
  ];
  if (opts.statusId) conditions.push(eq(deals.statusId, opts.statusId));
  if (opts.ownerId) conditions.push(eq(deals.ownerId, opts.ownerId));
  const where = and(...conditions.filter((c): c is SQL => Boolean(c)));

  const dir = opts.dir === "asc" ? asc : desc;
  const orderBy = {
    title: [dir(deals.title)],
    amount: [dir(deals.estimatedAmount)],
    close: [dir(deals.expectedCloseDate)],
    stage: [dir(dealStatuses.position)],
    updated: [dir(deals.updatedAt)],
  }[opts.sort ?? "updated"];

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        deal: deals,
        stageLabel: dealStatuses.label,
        stageColor: dealStatuses.color,
        stageProbability: dealStatuses.probability,
        stageOutcome: dealStatuses.outcome,
        typeLabel: dealTypes.label,
        ownerName: users.name,
        lossReasonLabel: lossReasons.label,
      })
      .from(deals)
      .innerJoin(dealStatuses, eq(deals.statusId, dealStatuses.id))
      .innerJoin(dealTypes, eq(deals.typeId, dealTypes.id))
      .leftJoin(users, eq(deals.ownerId, users.id))
      .leftJoin(lossReasons, eq(deals.lossReasonId, lossReasons.id))
      .where(where)
      .orderBy(...orderBy, asc(deals.id))
      .limit(DEALS_PAGE_SIZE)
      .offset((page - 1) * DEALS_PAGE_SIZE),
    db.select({ total: count() }).from(deals).where(where),
  ]);

  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / DEALS_PAGE_SIZE)) };
}

/**
 * Temps passé par étape pour une affaire : les lignes de
 * deal_stage_changes, bornées à maintenant pour l'étape courante. Renvoie
 * un cumul par étape (une étape revisitée cumule ses passages).
 */
export async function getDealStageDurations(user: OrgScopeUser, dealId: string) {
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  if (!deal) return [];
  assertOrgAccess(user, deal.organizationId);

  const changes = await db
    .select({
      toStatusId: dealStageChanges.toStatusId,
      changedAt: dealStageChanges.changedAt,
      label: dealStatuses.label,
      color: dealStatuses.color,
    })
    .from(dealStageChanges)
    .innerJoin(dealStatuses, eq(dealStageChanges.toStatusId, dealStatuses.id))
    .where(eq(dealStageChanges.dealId, dealId))
    .orderBy(asc(dealStageChanges.changedAt));

  const totals = new Map<string, { label: string; color: string | null; ms: number; current: boolean }>();
  for (let i = 0; i < changes.length; i++) {
    const start = changes[i].changedAt.getTime();
    const end = i + 1 < changes.length ? changes[i + 1].changedAt.getTime() : Date.now();
    const entry = totals.get(changes[i].toStatusId) ?? {
      label: changes[i].label,
      color: changes[i].color,
      ms: 0,
      current: false,
    };
    entry.ms += Math.max(0, end - start);
    entry.current = i === changes.length - 1;
    totals.set(changes[i].toStatusId, entry);
  }
  return [...totals.values()];
}

/**
 * Répartition par étape (compteur + somme des montants) pour l'en-tête du
 * kanban — calculée en base, jamais en chargeant la table entière.
 */
export async function getPipelineTotals(user: OrgScopeUser, pipelineId: string) {
  const scope = orgScope(user, deals.organizationId);
  return db
    .select({
      statusId: deals.statusId,
      n: count(),
      amount: sql<string | null>`sum(${deals.estimatedAmount})`,
    })
    .from(deals)
    .where(and(eq(deals.pipelineId, pipelineId), scope ?? undefined))
    .groupBy(deals.statusId);
}

export type PipelineSummary = {
  /** Étapes sans marqueur : ce qui est en cours. */
  open: { n: number; amount: number };
  won: { n: number; amount: number };
  lost: { n: number; amount: number };
};

/**
 * Compteurs et montants par marqueur d'étape (en cours / gagnées /
 * perdues), tous pipelines confondus — calculés en base pour le tableau
 * de bord, jamais en chargeant les affaires.
 */
export async function getPipelineSummary(user: OrgScopeUser): Promise<PipelineSummary> {
  const scope = orgScope(user, deals.organizationId);
  const rows = await db
    .select({
      outcome: dealStatuses.outcome,
      n: count(),
      amount: sql<string | null>`sum(${deals.estimatedAmount})`,
    })
    .from(deals)
    .innerJoin(dealStatuses, eq(deals.statusId, dealStatuses.id))
    .where(scope ?? undefined)
    .groupBy(dealStatuses.outcome);

  const summary: PipelineSummary = {
    open: { n: 0, amount: 0 },
    won: { n: 0, amount: 0 },
    lost: { n: 0, amount: 0 },
  };
  for (const row of rows) {
    const bucket = row.outcome === "won" ? summary.won : row.outcome === "lost" ? summary.lost : summary.open;
    bucket.n += row.n;
    bucket.amount += Number(row.amount) || 0;
  }
  return summary;
}
