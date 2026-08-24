"use server";

import { confirmCommission, markCommissionSettled } from "@/db/queries/commissions";
import {
  changeDealStage,
  createDeal,
  updateDealDetails,
  type CreateDealInput,
  type DealDetailsInput,
} from "@/db/queries/deals";
import { createDealType } from "@/db/queries/deal-types";
import { createLossReason, deleteLossReason } from "@/db/queries/loss-reasons";
import {
  createPipeline,
  createStage,
  moveStage,
  updatePipelineLabel,
  updateStage,
  type StageInput,
} from "@/db/queries/pipelines";
import {
  createDealShare,
  reissueDealShare,
  revokeDealShare,
  type CreateShareInput,
} from "@/db/queries/deal-shares";
import {
  createPartner,
  updatePartner,
  type CreatePartnerInput,
} from "@/db/queries/partners";
import { requireUser } from "@/lib/session";

/**
 * Server actions du module PRM — org-scopées via `requireUser()`, comme
 * `src/lib/newsletter/actions.ts`. Les fonctions de `src/db/queries/`
 * qu'elles appellent restent, elles, découplées de la session (prennent un
 * `OrgScopeUser` minimal) — même découplage que le module mailing.
 */

export async function createPartnerAction(input: CreatePartnerInput) {
  const user = await requireUser();
  return createPartner(user, input);
}

export async function updatePartnerAction(
  id: string,
  input: Partial<CreatePartnerInput> & { active?: boolean }
) {
  const user = await requireUser();
  return updatePartner(user, id, input);
}

export async function createDealAction(input: CreateDealInput) {
  const user = await requireUser();
  return createDeal(user, user.id, input);
}

export async function createDealTypeAction(label: string) {
  const user = await requireUser();
  return createDealType(user, label);
}

/** Renvoie { share, token } — le jeton en clair, UNE SEULE FOIS : à afficher immédiatement côté client, jamais récupérable après cet appel. */
export async function createDealShareAction(input: CreateShareInput) {
  const user = await requireUser();
  return createDealShare(user, user.id, input);
}

export async function revokeDealShareAction(shareId: string) {
  const user = await requireUser();
  return revokeDealShare(user, shareId);
}

/** "Renvoyer le lien" : révoque l'ancien partage, en crée un nouveau — renvoie le NOUVEAU jeton en clair, une seule fois. */
export async function reissueDealShareAction(shareId: string) {
  const user = await requireUser();
  return reissueDealShare(user, user.id, shareId);
}

/** Fiche affaire : prevue → confirmee, une fois l'affaire aboutie et le montant arrêté. */
export async function confirmCommissionAction(commissionId: string) {
  const user = await requireUser();
  return confirmCommission(user, user.id, commissionId);
}

/** Écran de suivi, pile "commissions confirmées non réglées" — la seule action possible dessus. */
export async function markCommissionSettledAction(commissionId: string) {
  const user = await requireUser();
  return markCommissionSettled(user, user.id, commissionId);
}

// ---------------------------------------------------------------------------
// Pipeline — déplacement d'affaires et configuration
// ---------------------------------------------------------------------------

/** LE geste du kanban et de la fiche : déplacer une affaire vers une étape. */
export async function moveDealStageAction(dealId: string, statusId: string, lossReasonId?: string | null) {
  const user = await requireUser();
  return changeDealStage(user, user.id, dealId, statusId, lossReasonId);
}

export async function updateDealDetailsAction(dealId: string, input: DealDetailsInput) {
  const user = await requireUser();
  return updateDealDetails(user, dealId, input);
}

export async function createPipelineAction(label: string) {
  const user = await requireUser();
  return createPipeline(user, label);
}

export async function updatePipelineLabelAction(pipelineId: string, label: string) {
  const user = await requireUser();
  return updatePipelineLabel(user, pipelineId, label);
}

export async function createStageAction(pipelineId: string, input: StageInput) {
  const user = await requireUser();
  return createStage(user, pipelineId, input);
}

export async function updateStageAction(stageId: string, input: StageInput) {
  const user = await requireUser();
  return updateStage(user, stageId, input);
}

export async function moveStageAction(stageId: string, direction: "up" | "down") {
  const user = await requireUser();
  return moveStage(user, stageId, direction);
}

export async function createLossReasonAction(label: string) {
  const user = await requireUser();
  return createLossReason(user, label);
}

export async function deleteLossReasonAction(id: string) {
  const user = await requireUser();
  return deleteLossReason(user, id);
}
