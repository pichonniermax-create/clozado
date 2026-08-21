"use server";

import { markCommissionSettled } from "@/db/queries/commissions";
import { createDeal, type CreateDealInput } from "@/db/queries/deals";
import { createDealType } from "@/db/queries/deal-types";
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

/** Écran de suivi, pile "commissions confirmées non réglées" — la seule action possible dessus. */
export async function markCommissionSettledAction(commissionId: string) {
  const user = await requireUser();
  return markCommissionSettled(user, user.id, commissionId);
}
