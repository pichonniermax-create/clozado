"use server";

import { redirect } from "next/navigation";
import {
  completeTask,
  createTask,
  deleteTask,
  reopenTask,
  updateTask,
  type TaskInput,
} from "@/db/queries/tasks";
import { errorMessage, withError } from "@/lib/form-actions";
import { requireUser } from "@/lib/session";

/**
 * Server actions du module tâches — org-scopées via `requireUser()`, même
 * découplage que contacts et PRM. Toutes reviennent à l'écran appelant
 * (`backTo` : l'écran des tâches, une fiche contact, une fiche affaire), en
 * portant l'erreur éventuelle en paramètre d'URL plutôt qu'en écran
 * d'erreur : se tromper dans un formulaire n'est pas une panne.
 */

type ActionContext = {
  /** Chemin interne de l'écran appelant, paramètres compris. */
  backTo: string;
};

function readPriority(formData: FormData): "low" | "normal" | "high" {
  const value = String(formData.get("priority") ?? "");
  return value === "low" || value === "high" ? value : "normal";
}

function readRecurrence(formData: FormData): Pick<TaskInput, "recurUnit" | "recurEvery"> {
  const unit = String(formData.get("recurUnit") ?? "");
  if (unit !== "day" && unit !== "week" && unit !== "month" && unit !== "year") {
    return { recurUnit: null, recurEvery: null };
  }
  const every = Number.parseInt(String(formData.get("recurEvery") ?? "1"), 10);
  return { recurUnit: unit, recurEvery: Number.isNaN(every) ? 1 : every };
}

/** Création depuis l'écran des tâches — tous les champs, responsable explicite. */
export async function createTaskFromBoardAction(context: ActionContext, formData: FormData) {
  const user = await requireUser();
  let destination = context.backTo;
  try {
    await createTask(user, user.id, {
      title: String(formData.get("title") ?? ""),
      dueDate: String(formData.get("dueDate") ?? "") || null,
      priority: readPriority(formData),
      assigneeId: String(formData.get("assigneeId") ?? "") || null,
      ...readRecurrence(formData),
    });
  } catch (error) {
    destination = withError(context.backTo, errorMessage(error));
  }
  redirect(destination);
}

/** Ajout rapide depuis une fiche (contact ou affaire) : titre + échéance + priorité, attribuée au créateur, rattachée à la fiche. */
export async function createTaskFromFicheAction(
  context: ActionContext & { contactId?: string; dealId?: string },
  formData: FormData
) {
  const user = await requireUser();
  let destination = context.backTo;
  try {
    await createTask(user, user.id, {
      title: String(formData.get("title") ?? ""),
      dueDate: String(formData.get("dueDate") ?? "") || null,
      priority: readPriority(formData),
      contactId: context.contactId ?? null,
      dealId: context.dealId ?? null,
    });
  } catch (error) {
    destination = withError(context.backTo, errorMessage(error));
  }
  redirect(destination);
}

export async function updateTaskAction(
  context: ActionContext & { taskId: string },
  formData: FormData
) {
  const user = await requireUser();
  let destination = context.backTo;
  try {
    await updateTask(user, context.taskId, {
      title: String(formData.get("title") ?? ""),
      notes: String(formData.get("notes") ?? "") || null,
      dueDate: String(formData.get("dueDate") ?? "") || null,
      priority: readPriority(formData),
      assigneeId: String(formData.get("assigneeId") ?? "") || null,
      ...readRecurrence(formData),
    });
  } catch (error) {
    destination = withError(context.backTo, errorMessage(error));
  }
  redirect(destination);
}

export async function completeTaskAction(context: ActionContext & { taskId: string }) {
  const user = await requireUser();
  let destination = context.backTo;
  try {
    await completeTask(user, context.taskId, user.id);
  } catch (error) {
    destination = withError(context.backTo, errorMessage(error));
  }
  redirect(destination);
}

export async function reopenTaskAction(context: ActionContext & { taskId: string }) {
  const user = await requireUser();
  let destination = context.backTo;
  try {
    await reopenTask(user, context.taskId);
  } catch (error) {
    destination = withError(context.backTo, errorMessage(error));
  }
  redirect(destination);
}

export async function deleteTaskAction(context: ActionContext & { taskId: string }) {
  const user = await requireUser();
  let destination = context.backTo;
  try {
    await deleteTask(user, context.taskId);
  } catch (error) {
    destination = withError(context.backTo, errorMessage(error));
  }
  redirect(destination);
}
