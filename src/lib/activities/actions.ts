"use server";

import { redirect } from "next/navigation";
import { JOURNAL_ERROR_PARAM } from "@/components/activities/labels";
import {
  createActivity,
  deleteActivity,
  isActivityType,
  parseLocalDateTime,
} from "@/db/queries/activities";
import { errorMessage, withError } from "@/lib/form-actions";
import { requireUser } from "@/lib/session";
import { AppError } from "@/lib/errors";

/**
 * Server actions du journal — org-scopées via `requireUser()`, même
 * découplage que les tâches : elles reviennent à la fiche appelante, l'erreur
 * éventuelle en paramètre d'URL dédié (la fiche porte aussi la section
 * tâches, qui a le sien — deux formulaires, deux messages, jamais confondus).
 */

type FicheContext = {
  /** Chemin de la fiche — l'action y revient. */
  backTo: string;
  contactId?: string;
  dealId?: string;
};

export async function logActivityAction(context: FicheContext, formData: FormData) {
  const user = await requireUser();
  let destination = context.backTo;
  try {
    const type = String(formData.get("type") ?? "");
    if (!isActivityType(type)) throw new AppError("choisis_le_type_d_interaction");
    await createActivity(user, user.id, {
      type,
      content: String(formData.get("content") ?? ""),
      occurredAt: parseLocalDateTime(String(formData.get("occurredAt") ?? "")),
      contactId: context.contactId ?? null,
      dealId: context.dealId ?? null,
    });
  } catch (error) {
    destination = withError(context.backTo, await errorMessage(error), JOURNAL_ERROR_PARAM);
  }
  redirect(destination);
}

export async function deleteActivityAction(context: { backTo: string; activityId: string }) {
  const user = await requireUser();
  let destination = context.backTo;
  try {
    await deleteActivity(user, context.activityId);
  } catch (error) {
    destination = withError(context.backTo, await errorMessage(error), JOURNAL_ERROR_PARAM);
  }
  redirect(destination);
}
