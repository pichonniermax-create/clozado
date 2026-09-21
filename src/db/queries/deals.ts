import { randomUUID } from "crypto";
import { and, asc, count, desc, eq, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
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
import { assertOrgAccess, assertUserInOrg, orgScope } from "@/db/scope";
import { filtersToSql, type FilterTarget } from "./filter-sql";
import type { FilterCondition } from "@/lib/display/filters";
import { PRODUCT_TIMEZONE } from "@/lib/timezone";
import { dealSelectionCondition, type DealSelection } from "@/lib/metrics/funnel";
import { latestLeadBefore } from "./acquisition";
import { getDefaultDealStatus } from "./deal-statuses";
import type { OrgScopeUser } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { isStale, type InlinePatch } from "@/lib/fiches/inline";
import { checkAmount, checkDate, checkLength, checkPercent } from "@/lib/fiches/validate";
import { lastEntryCte } from "@/lib/metrics/losses";
import { MIN_OBSERVATIONS } from "@/lib/metrics/definitions";
import { readInput } from "@/lib/validation";

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
  /** Le responsable : absent = la personne qui crée ; null = explicitement personne (stabilisation, P1). */
  ownerId?: string | null;
  estimatedAmount?: string | null;
  description?: string | null;
};

/**
 * La forme STRICTE de ce qu'un client peut envoyer (constat S1 de l'audit) :
 * les écritures ci-dessous étaient déjà recopiées champ par champ, ce
 * schéma en fait une règle plutôt qu'une habitude — une clé inconnue
 * (`organizationId`, `id`, `createdBy`) est refusée avant toute lecture.
 */
const optionalText = (max: number) => z.string().max(max).nullable().optional();

export const CREATE_DEAL_SCHEMA = z.strictObject({
  title: z.string().max(300),
  clientName: z.string().max(300),
  typeId: z.uuid(),
  statusId: z.uuid().optional(),
  contactId: z.uuid().nullable().optional(),
  ownerId: z.uuid().nullable().optional(),
  estimatedAmount: optionalText(40),
  description: optionalText(10_000),
});

export async function createDeal(
  user: OrgScopeUser,
  createdBy: string,
  rawInput: CreateDealInput
) {
  if (!user.organizationId) {
    throw new AppError("aucune_organisation_selectionnee_choisis_une_organisation_dans_a16a");
  }
  const input = readInput(CREATE_DEAL_SCHEMA, rawInput);

  // Le type doit exister ET appartenir à cette organisation — vérifié ici
  // en plus de la FK composite en base (message d'erreur clair côté
  // application plutôt qu'une simple violation de contrainte SQL).
  const type = await db.query.dealTypes.findFirst({ where: eq(dealTypes.id, input.typeId) });
  if (!type || type.organizationId !== user.organizationId) {
    throw new AppError("type_d_affaire_introuvable_pour_cette_organisation", undefined, 404);
  }

  // Le statut résolu porte aussi le pipeline : une affaire naît TOUJOURS
  // dans le pipeline de son statut initial (FK composite en base).
  let status;
  if (input.statusId) {
    status = await db.query.dealStatuses.findFirst({ where: eq(dealStatuses.id, input.statusId) });
    if (!status || status.organizationId !== user.organizationId) {
      throw new AppError("statut_introuvable_pour_cette_organisation", undefined, 404);
    }
  } else {
    status = await getDefaultDealStatus(user.organizationId);
  }

  let clientName = input.clientName.trim();
  if (input.contactId) {
    const contact = await db.query.contacts.findFirst({ where: eq(contacts.id, input.contactId) });
    if (!contact || contact.organizationId !== user.organizationId) {
      throw new AppError("fiche_contact_introuvable_pour_cette_organisation", undefined, 404);
    }
    if (contact.deletedAt) {
      throw new AppError("cette_fiche_contact_a_ete_supprimee_elle_160e");
    }
    if (!clientName) clientName = contact.name;
  }

  // Le responsable (stabilisation, P1) : la personne qui crée, sauf choix explicite (« Personne » = null) — avant,
  // jamais posé : « — » en liste, « Personne » sur la fiche, hors du filtre par conseiller. Jamais un id étranger.
  const ownerId = input.ownerId === undefined ? createdBy : input.ownerId;
  if (ownerId) await assertUserInOrg(ownerId, user.organizationId);

  // L'origine : le lead le plus récent du contact reçu AVANT la création —
  // figée ici, jamais rattachée automatiquement après coup (un lead
  // postérieur n'a pas généré l'affaire) ; modifiable à la main, journalisé.
  const leadId = input.contactId
    ? await latestLeadBefore(user.organizationId, input.contactId, new Date())
    : null;

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
      leadId,
      typeId: input.typeId,
      statusId: status.id,
      pipelineId: status.pipelineId,
      estimatedAmount: input.estimatedAmount ?? null,
      description: input.description ?? null,
      ownerId,
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
  if (!deal) throw new AppError("affaire_introuvable", undefined, 404);
  assertOrgAccess(user, deal.organizationId);
  if (deal.statusId === statusId) return deal;

  const status = await db.query.dealStatuses.findFirst({ where: eq(dealStatuses.id, statusId) });
  if (!status || status.organizationId !== deal.organizationId) {
    throw new AppError("etape_introuvable_pour_cette_organisation", undefined, 404);
  }
  // La FK composite deals_status_pipeline_fk le refuserait de toute façon —
  // ici pour l'erreur claire. Changer de pipeline sera un geste dédié,
  // jamais un effet de bord d'un changement d'étape.
  if (status.pipelineId !== deal.pipelineId) {
    throw new AppError("cette_etape_appartient_a_un_autre_pipeline_9d7d");
  }

  let reasonId: string | null = null;
  if (status.outcome === "lost" && lossReasonId) {
    const reason = await db.query.lossReasons.findFirst({ where: eq(lossReasons.id, lossReasonId) });
    if (!reason || reason.organizationId !== deal.organizationId) {
      throw new AppError("motif_de_perte_introuvable_pour_cette_organisation", undefined, 404);
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
  /** Rattacher une fiche contact après coup (jamais détacher) — stabilisation, P1. */
  contactId?: string | null;
  /** Pris en compte seulement si l'étape courante est marquée perdue. */
  lossReasonId?: string | null;
};

export const DEAL_DETAILS_SCHEMA = z.strictObject({
  estimatedAmount: optionalText(40),
  probability: optionalText(10),
  expectedCloseDate: optionalText(10),
  ownerId: z.uuid().nullable().optional(),
  contactId: z.uuid().nullable().optional(),
  lossReasonId: z.uuid().nullable().optional(),
});

/**
 * LA MODIFICATION EN PLACE d'une affaire (chantier « les fiches deviennent
 * modifiables »). Mêmes gardes que partout — organisation, VERSION de la
 * fiche, liste blanche, forme de la valeur — et trois chemins d'écriture
 * selon le champ, parce que trois choses différentes se passent :
 *
 * - l'ÉTAPE passe par `changeDealStage` : elle écrit l'historique et le
 *   journal, et c'est ce qui fait les délais et le funnel. Une étape
 *   changée en douce les fausserait ;
 * - le TITRE, le TYPE et la DESCRIPTION s'écrivent ici (ils n'existaient
 *   dans aucun chemin de modification jusqu'ici) ;
 * - le reste passe par `updateDealDetails`, avec ses règles (le conseiller
 *   de l'organisation, la fiche contact vivante dont le nom du client est
 *   recopié, le motif de perte reporté sur le passage d'étape).
 *
 * LE MONTANT ET LA COMMISSION : changer le montant ne recalcule JAMAIS une
 * commission déjà convenue. La base le garantit déjà (`commissions.
 * computed_amount` est figé, `base_amount` garde le montant sur lequel on
 * s'est entendu) ; la fiche, elle, le DIT désormais.
 */
const DEAL_PATCH_FIELDS = ["title", "description", "typeId", "statusId", "estimatedAmount", "probability", "expectedCloseDate", "ownerId", "contactId", "lossReasonId"] as const;

export async function patchDeal(user: OrgScopeUser, actorUserId: string, dealId: string, patch: InlinePatch) {
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  if (!deal) throw new AppError("affaire_introuvable", undefined, 404);
  assertOrgAccess(user, deal.organizationId);
  if (isStale(deal, patch.version)) throw new AppError("la_fiche_a_change_ailleurs", undefined, 409);
  if (!(DEAL_PATCH_FIELDS as readonly string[]).includes(patch.field)) throw new AppError("ce_champ_ne_se_modifie_pas_ici");

  const value = patch.value.trim() || null;
  if (patch.field === "title" && !value) throw new AppError("le_nom_est_obligatoire");
  const problem =
    patch.field === "estimatedAmount"
      ? checkAmount(value)
      : patch.field === "probability"
        ? checkPercent(value)
        : patch.field === "expectedCloseDate"
          ? checkDate(value)
          : patch.field === "title"
            ? checkLength(value, 200)
            : patch.field === "description"
              ? checkLength(value, 5000)
              : null;
  if (problem) throw new AppError(problem);

  if (patch.field === "statusId") {
    if (!value) throw new AppError("l_etape_est_obligatoire");
    await changeDealStage(user, actorUserId, dealId, value);
  } else if (patch.field === "title" || patch.field === "description" || patch.field === "typeId") {
    if (patch.field === "typeId") {
      if (!value) throw new AppError("le_type_est_obligatoire");
      const type = await db.query.dealTypes.findFirst({ where: eq(dealTypes.id, value) });
      if (!type || type.organizationId !== deal.organizationId) throw new AppError("type_d_affaire_introuvable", undefined, 404);
    }
    await db
      .update(deals)
      .set({ ...(patch.field === "title" ? { title: value! } : patch.field === "typeId" ? { typeId: value! } : { description: value }), updatedAt: new Date() })
      .where(eq(deals.id, dealId));
  } else {
    // Le montant s'écrit en nombre brut : « 1 234,50 » saisi devient « 1234.50 » en base.
    const normalized = patch.field === "estimatedAmount" && value ? value.replace(/\s/g, "").replace(",", ".") : value;
    await updateDealDetails(user, dealId, { [patch.field]: normalized });
  }
  return (await db.query.deals.findFirst({ where: eq(deals.id, dealId) }))!;
}

export async function updateDealDetails(user: OrgScopeUser, dealId: string, rawInput: DealDetailsInput) {
  const input = readInput(DEAL_DETAILS_SCHEMA, rawInput);
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  if (!deal) throw new AppError("affaire_introuvable", undefined, 404);
  assertOrgAccess(user, deal.organizationId);

  if (input.ownerId) {
    const owner = await db.query.users.findFirst({ where: eq(users.id, input.ownerId) });
    if (!owner || owner.organizationId !== deal.organizationId) {
      throw new AppError("ce_conseiller_n_appartient_pas_a_l_2bd0");
    }
  }
  // Rattacher une fiche (stabilisation, P1) : une fiche de l'organisation, vivante ; le nom du client suit — la
  // même copie qu'à la création. Le rattachement ne se défait pas ici (une fiche supprimée devient une tombale).
  let contactPatch: { contactId: string; clientName: string } | null = null;
  if (input.contactId) {
    const contact = await db.query.contacts.findFirst({ where: eq(contacts.id, input.contactId) });
    if (!contact || contact.organizationId !== deal.organizationId) {
      throw new AppError("fiche_contact_introuvable_pour_cette_organisation", undefined, 404);
    }
    if (contact.deletedAt) throw new AppError("cette_fiche_contact_a_ete_supprimee_elle_160e");
    contactPatch = { contactId: contact.id, clientName: contact.name };
  }
  let lossReasonId = deal.lossReasonId;
  if (input.lossReasonId !== undefined) {
    if (input.lossReasonId) {
      const reason = await db.query.lossReasons.findFirst({ where: eq(lossReasons.id, input.lossReasonId) });
      if (!reason || reason.organizationId !== deal.organizationId) {
        throw new AppError("motif_de_perte_introuvable_pour_cette_organisation", undefined, 404);
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
      ...(contactPatch ?? {}),
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
  /**
   * La sélection venue de l'analytique (clic sur un pas du funnel) : la
   * condition est celle de la couche de métriques, telle quelle — la liste
   * montre exactement ce que le funnel a compté. Ignorée sans organisation
   * (l'écran refuse la vue globale avant d'arriver ici).
   */
  selection?: DealSelection;
  sort?: DealsTableSort;
  dir?: "asc" | "desc";
  /** Le jeu du constructeur de filtres (lot 3), déjà lu et « moi » résolu. */
  filters?: FilterCondition[];
  /** Le fuseau de l'organisation : les dates d'un filtre se lisent dedans. */
  timeZone?: string;
  page?: number;
};

/** La liste dense : triable, filtrable, paginée côté serveur. */
/**
 * LES CHAMPS FILTRABLES DES AFFAIRES (lot 3) — même règle que pour les
 * contacts : chaque cible ne parle que de la table `deals`, parce que le
 * compte de la liste se fait sans jointure.
 */
export const DEAL_FILTER_TARGETS: Record<string, FilterTarget> = {
  titre: { kind: "column", type: "texte", column: deals.title },
  client: { kind: "column", type: "texte", column: deals.clientName },
  montant: { kind: "column", type: "nombre", column: deals.estimatedAmount },
  etape: { kind: "column", type: "liste", column: deals.statusId },
  type: { kind: "column", type: "liste", column: deals.typeId },
  pipeline: { kind: "column", type: "liste", column: deals.pipelineId },
  conseiller: { kind: "column", type: "liste", column: deals.ownerId },
  creation: { kind: "column", type: "date", column: deals.createdAt },
  // L'ISSUE est celle de l'ÉTAPE COURANTE : une sous-requête sur les étapes, jamais une jointure.
  issue: {
    kind: "custom",
    type: "liste",
    build: (condition) => {
      const outcomes = condition.values.map((v) => (v === "gagnee" ? "won" : v === "perdue" ? "lost" : "en-cours"));
      const wanted = outcomes.filter((o) => o === "won" || o === "lost");
      const open = outcomes.includes("en-cours");
      const set = (o: string[]) =>
        sql`(select ${dealStatuses.id} from ${dealStatuses} where ${dealStatuses.outcome} in ${o})`;
      const openSet = sql`(select ${dealStatuses.id} from ${dealStatuses} where ${dealStatuses.outcome} is null)`;
      const parts = [wanted.length > 0 ? sql`${deals.statusId} in ${set(wanted)}` : undefined, open ? sql`${deals.statusId} in ${openSet}` : undefined].filter(
        (p): p is SQL => Boolean(p)
      );
      if (parts.length === 0) return undefined;
      const matches = parts.length === 1 ? parts[0] : or(...parts)!;
      // « n'est pas » : tout ce qui n'entre pas dans l'ensemble désigné.
      return condition.operator === "ne" ? sql`not (${matches})` : matches;
    },
  },
  // `expected_close_date` est une DATE, pas un instant : on la compare en jours, sans fuseau.
  cloture: {
    kind: "custom",
    type: "date",
    build: (condition, ctx) => {
      const [a, b] = condition.values;
      switch (condition.operator) {
        case "before":
          return sql`${deals.expectedCloseDate} < ${a}`;
        case "after":
          return sql`${deals.expectedCloseDate} > ${a}`;
        case "bt":
          return sql`${deals.expectedCloseDate} >= ${a} and ${deals.expectedCloseDate} <= ${b}`;
        case "last": {
          const from = new Date(ctx.now.getTime() - Number(a) * 86_400_000).toISOString().slice(0, 10);
          return sql`${deals.expectedCloseDate} >= ${from}`;
        }
        default:
          return undefined;
      }
    },
  },
};

/**
 * CE QUE LA LISTE MONTRE, en conditions — le pipeline, l'étape, le
 * conseiller, la sélection venue du funnel, et le constructeur de filtres.
 * Extraites (lot « affaires ») pour que le BANDEAU D'INDICATEURS compte
 * exactement les affaires affichées : deux constructions voisines auraient
 * fini par diverger d'une condition.
 */
function dealsTableWhere(user: OrgScopeUser, opts: DealsTableOptions): SQL | undefined {
  const conditions: (SQL | undefined)[] = [
    orgScope(user, deals.organizationId),
    eq(deals.pipelineId, opts.pipelineId),
  ];
  if (opts.statusId) conditions.push(eq(deals.statusId, opts.statusId));
  if (opts.ownerId) conditions.push(eq(deals.ownerId, opts.ownerId));
  if (opts.selection && user.organizationId) {
    conditions.push(dealSelectionCondition(user.organizationId, opts.selection, sql`${deals}`));
  }
  // Le constructeur de filtres (lot 3), combiné en ET avec le reste.
  if (opts.filters?.length) {
    conditions.push(filtersToSql(opts.filters, DEAL_FILTER_TARGETS, { timeZone: opts.timeZone ?? PRODUCT_TIMEZONE, now: new Date() }));
  }
  return and(...conditions.filter((c): c is SQL => Boolean(c)));
}

export async function listDealsTable(user: OrgScopeUser, opts: DealsTableOptions) {
  const page = Math.max(1, opts.page ?? 1);
  const where = dealsTableWhere(user, opts);

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

// ---------------------------------------------------------------------------
// Le bandeau d'indicateurs d'un pipeline
// ---------------------------------------------------------------------------

export type DealsIndicators = {
  /** Les affaires que la liste montre, filtres compris. */
  n: number;
  /** Somme des montants estimés ; les affaires sans montant sont dans le nombre, pas dans la somme. */
  amount: number;
  withoutAmount: number;
  /** Affaires EN COURS (étape sans issue) : c'est sur elles que portent le pondéré et l'âge. */
  openN: number;
  /** Σ montant × probabilité, sur les affaires en cours — la probabilité de l'affaire, sinon celle de son étape. */
  weighted: number;
  /** Gagnées DANS LA PÉRIODE, à la date de leur dernière entrée en étape gagnée (la règle de l'analytique). */
  wonN: number;
  wonAmount: number;
  /** Perdues dans la période, même règle. */
  lostN: number;
  /** Gagnées ÷ (gagnées + perdues) sur la période ; `null` sous le seuil d'observations. */
  transformation: number | null;
  /** Âge moyen des affaires en cours, en jours ; `null` s'il n'y en a aucune. */
  averageAgeDays: number | null;
};

/**
 * LE BANDEAU DU MODULE AFFAIRES — six chiffres au-dessus du kanban et de la
 * liste, qui suivent LES FILTRES ACTIFS (mêmes conditions que la liste,
 * `dealsTableWhere`).
 *
 * Deux temps, dits à l'écran : l'état d'AUJOURD'HUI (nombre, montant,
 * pondéré, âge moyen) et ce qui s'est passé DANS LA PÉRIODE (gagné,
 * transformation). Les secondes suivent la règle de l'analytique — une
 * affaire est « gagnée dans la période » à la date de sa DERNIÈRE entrée en
 * étape gagnée, jamais reconstruite : le bandeau et l'écran des volumes ne
 * peuvent donc pas annoncer deux chiffres différents.
 */
export async function dealsIndicators(
  user: OrgScopeUser,
  opts: DealsTableOptions & { from?: Date; to?: Date }
): Promise<DealsIndicators> {
  const where = dealsTableWhere(user, opts);
  const organizationId = user.organizationId;
  const inPeriod = (column: SQL) =>
    sql`${opts.from ? sql`${column} >= ${opts.from}` : sql`true`} AND ${opts.to ? sql`${column} < ${opts.to}` : sql`true`}`;
  // Sans organisation (super admin en vue globale), il n'y a pas de journal d'étapes à interroger.
  const closed = organizationId
    ? sql`
      WITH last_won AS (${lastEntryCte(organizationId, "won")}), last_lost AS (${lastEntryCte(organizationId, "lost")})
      SELECT
        count(*) FILTER (WHERE ${dealStatuses.outcome} = 'won' AND EXISTS (
          SELECT 1 FROM last_won lw WHERE lw.deal_id = ${deals.id} AND NOT lw.reconstructed AND ${inPeriod(sql`lw.changed_at`)})) AS won_n,
        coalesce(sum(${deals.estimatedAmount}) FILTER (WHERE ${dealStatuses.outcome} = 'won' AND EXISTS (
          SELECT 1 FROM last_won lw WHERE lw.deal_id = ${deals.id} AND NOT lw.reconstructed AND ${inPeriod(sql`lw.changed_at`)})), 0) AS won_amount,
        count(*) FILTER (WHERE ${dealStatuses.outcome} = 'lost' AND EXISTS (
          SELECT 1 FROM last_lost ll WHERE ll.deal_id = ${deals.id} AND NOT ll.reconstructed AND ${inPeriod(sql`ll.changed_at`)})) AS lost_n
      FROM ${deals}
      JOIN ${dealStatuses} ON ${dealStatuses.id} = ${deals.statusId}
      ${where ? sql`WHERE ${where}` : sql``}
    `
    : null;

  const [current, closedRows] = await Promise.all([
    db
      .select({
        n: sql<number>`count(*)::int`,
        amount: sql<string>`coalesce(sum(${deals.estimatedAmount}), 0)`,
        withoutAmount: sql<number>`count(*) FILTER (WHERE ${deals.estimatedAmount} IS NULL)::int`,
        openN: sql<number>`count(*) FILTER (WHERE ${dealStatuses.outcome} IS NULL)::int`,
        weighted: sql<string>`coalesce(sum(
          ${deals.estimatedAmount} * coalesce(${deals.probability}, ${dealStatuses.probability}, 0) / 100
        ) FILTER (WHERE ${dealStatuses.outcome} IS NULL), 0)`,
        ageDays: sql<string | null>`avg(extract(epoch FROM (now() - ${deals.createdAt})) / 86400) FILTER (WHERE ${dealStatuses.outcome} IS NULL)`,
      })
      .from(deals)
      .innerJoin(dealStatuses, eq(dealStatuses.id, deals.statusId))
      .where(where),
    closed ? db.execute(closed) : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
  ]);

  const row = current[0];
  const c = (closedRows.rows[0] ?? {}) as Record<string, unknown>;
  const wonN = Number(c.won_n) || 0;
  const lostN = Number(c.lost_n) || 0;
  const decided = wonN + lostN;
  return {
    n: row?.n ?? 0,
    amount: Number(row?.amount) || 0,
    withoutAmount: row?.withoutAmount ?? 0,
    openN: row?.openN ?? 0,
    weighted: Number(row?.weighted) || 0,
    wonN,
    wonAmount: Number(c.won_amount) || 0,
    lostN,
    // Sous le seuil d'observations du produit, un pourcentage ment : on le masque et l'écran dit pourquoi.
    transformation: decided >= MIN_OBSERVATIONS ? wonN / decided : null,
    averageAgeDays: row?.ageDays === null || row?.ageDays === undefined ? null : Number(row.ageDays),
  };
}
