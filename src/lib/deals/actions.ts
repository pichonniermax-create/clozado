"use server";

import { createDeal, type CreateDealInput } from "@/db/queries/deals";
import { createDealType } from "@/db/queries/deal-types";
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
