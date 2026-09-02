"use server";

import { redirect } from "next/navigation";
import { APPOINTMENT_ERROR_PARAM } from "@/components/appointments/labels";
import { cancelAppointment, createManualAppointment } from "@/db/queries/appointments";
import { resolveRequestSettings } from "@/i18n/locale";
import { errorMessage, withError } from "@/lib/form-actions";
import { requireUser } from "@/lib/session";
import { parseLocalDateTime } from "@/lib/timezone";

/**
 * Server actions des rendez-vous — org-scopées via `requireUser()`, retour
 * à la fiche appelante avec l'erreur éventuelle en paramètre d'URL dédié,
 * comme le journal et les tâches.
 */

type FicheContext = {
  /** Chemin de la fiche — l'action y revient. */
  backTo: string;
  contactId: string;
};

export async function createAppointmentAction(context: FicheContext, formData: FormData) {
  const user = await requireUser();
  let destination = context.backTo;
  try {
    await createManualAppointment(user, user.id, {
      contactId: context.contactId,
      // Vide = maintenant : le même formulaire couvre « rendez-vous
      // maintenant » et « rendez-vous le… » (§5.1).
      startsAt: parseLocalDateTime(String(formData.get("startsAt") ?? ""), (await resolveRequestSettings()).timeZone),
      title: String(formData.get("title") ?? ""),
    });
  } catch (error) {
    destination = withError(context.backTo, await errorMessage(error), APPOINTMENT_ERROR_PARAM);
  }
  redirect(destination);
}

export async function cancelAppointmentAction(context: { backTo: string; appointmentId: string }) {
  const user = await requireUser();
  let destination = context.backTo;
  try {
    await cancelAppointment(user, context.appointmentId);
  } catch (error) {
    destination = withError(context.backTo, await errorMessage(error), APPOINTMENT_ERROR_PARAM);
  }
  redirect(destination);
}
