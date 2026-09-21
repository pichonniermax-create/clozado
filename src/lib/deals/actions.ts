"use server";

import { confirmCommission, markCommissionSettled } from "@/db/queries/commissions";
import {
  changeDealStage,
  createDeal,
  patchDeal,
  updateDealDetails,
  type CreateDealInput,
  type DealDetailsInput,
} from "@/db/queries/deals";
import { createDealType, renameDealType } from "@/db/queries/deal-types";
import { createLossReason, deleteLossReason } from "@/db/queries/loss-reasons";
import {
  createPipeline,
  createStage,
  moveStage,
  updatePipelineLabel,
  updateStage,
  type StageInput,
} from "@/db/queries/pipelines";
import { createDealShare, reissueDealShare, revokeDealShare } from "@/db/queries/deal-shares";
import type { CreateShareInput } from "@/lib/deal-shares/input";
import {
  createPartner,
  patchPartner,
  updatePartner,
  type CreatePartnerInput,
} from "@/db/queries/partners";
import { actionResult, errorMessage } from "@/lib/form-actions";
import { isAppError } from "@/lib/errors";
import { versionOf, type InlinePatch, type InlineSaveResult } from "@/lib/fiches/inline";
import { requireUser } from "@/lib/session";
import { getTranslations } from "next-intl/server";

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

/**
 * LA MODIFICATION EN PLACE, côté affaire et côté confrère (chantier « les
 * fiches deviennent modifiables »). Elles ne redirigent pas : elles
 * RENDENT leur verdict au champ, qui remet la valeur précédente et dit
 * pourquoi en cas de refus. Toutes les gardes sont dans `patchDeal` /
 * `patchPartner` — appeler l'action directement avec l'identifiant d'une
 * fiche d'une autre organisation ne modifie rien.
 */
export async function patchDealFieldAction(id: string, patch: InlinePatch): Promise<InlineSaveResult> {
  const user = await requireUser();
  if (user.readOnly) return { ok: false, error: (await getTranslations("demo.banner"))("lecture_seule_notice") };
  try {
    const updated = await patchDeal(user, user.id, id, patch);
    return { ok: true, version: versionOf(updated) };
  } catch (error) {
    return { ok: false, error: await errorMessage(error), stale: isAppError(error) && error.status === 409 };
  }
}

export async function patchPartnerFieldAction(id: string, patch: InlinePatch): Promise<InlineSaveResult> {
  const user = await requireUser();
  if (user.readOnly) return { ok: false, error: (await getTranslations("demo.banner"))("lecture_seule_notice") };
  try {
    const updated = await patchPartner(user, id, patch);
    return { ok: true, version: versionOf(updated) };
  } catch (error) {
    return { ok: false, error: await errorMessage(error), stale: isAppError(error) && error.status === 409 };
  }
}

export async function createDealAction(input: CreateDealInput) {
  const user = await requireUser();
  return createDeal(user, user.id, input);
}

export async function createDealTypeAction(label: string) {
  const user = await requireUser();
  return createDealType(user, label);
}

export async function renameDealTypeAction(id: string, label: string) {
  const user = await requireUser();
  return renameDealType(user, id, label);
}

/** Renvoie { share, token } — le jeton en clair, UNE SEULE FOIS : à afficher immédiatement côté client, jamais récupérable après cet appel. */
export async function createDealShareAction(input: CreateShareInput) {
  const user = await requireUser();
  // Appelée depuis le composeur (client) : l'échec est RENDU, traduit — jamais levé avec sa clé (stabilisation, E3).
  return actionResult(() => createDealShare(user, user.id, input));
}

export async function revokeDealShareAction(shareId: string) {
  const user = await requireUser();
  return revokeDealShare(user, shareId, user.id);
}

/** "Renvoyer le lien" : révoque l'ancien partage, en crée un nouveau — renvoie le NOUVEAU jeton en clair, une seule fois. */
export async function reissueDealShareAction(shareId: string) {
  const user = await requireUser();
  return reissueDealShare(user, user.id, shareId);
}

/** Fiche affaire : prevue → confirmee, une fois l'affaire aboutie et le montant arrêté. */
export async function confirmCommissionAction(commissionId: string) {
  const user = await requireUser();
  const t = await getTranslations("shares.queries");
  return actionResult(async () => {
    await confirmCommission(user, user.id, commissionId, t);
  });
}

/** Écran de suivi, pile "commissions confirmées non réglées" — la seule action possible dessus. */
export async function markCommissionSettledAction(commissionId: string) {
  const user = await requireUser();
  const t = await getTranslations("shares.queries");
  return actionResult(async () => {
    await markCommissionSettled(user, user.id, commissionId, t);
  });
}

// ---------------------------------------------------------------------------
// Pipeline — déplacement d'affaires et configuration
// ---------------------------------------------------------------------------

/** LE geste du kanban et de la fiche : déplacer une affaire vers une étape. */
export async function moveDealStageAction(dealId: string, statusId: string, lossReasonId?: string | null) {
  const user = await requireUser();
  // Le kanban (client) affiche la phrase rendue — avant, la clé brute de l'AppError (stabilisation, E3).
  return actionResult(async () => {
    await changeDealStage(user, user.id, dealId, statusId, lossReasonId);
  });
}

export async function updateDealDetailsAction(dealId: string, input: DealDetailsInput) {
  const user = await requireUser();
  return actionResult(async () => {
    await updateDealDetails(user, dealId, input);
  });
}

export async function createPipelineAction(label: string) {
  const user = await requireUser();
  return createPipeline(user, label, await getTranslations("deals.queries"));
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
