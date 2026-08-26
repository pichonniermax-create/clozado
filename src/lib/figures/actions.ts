"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createVerifiedFigure,
  deleteVerifiedFigure,
  followIndicator,
  unfollowIndicator,
  updateVerifiedFigure,
  type VerifiedFigureInput,
} from "@/db/queries/market";
import { getOwnOrganization } from "@/db/queries/organizations";
import { errorMessage, withError } from "@/lib/form-actions";
import { resolveBusinessPack } from "@/lib/metrics/packs";
import { requireUser } from "@/lib/session";
import { followPackIndicators, refreshOrganizationIndicators } from "@/lib/watch/refresh";
import { getTranslations } from "next-intl/server";
import { AppError } from "@/lib/errors";

/**
 * Server actions des chiffres vérifiés et des indicateurs suivis — même
 * découplage que la veille. Un chiffre venu d'un indicateur n'est jamais
 * modifié à la main (les requêtes le refusent) ; il se retire en cessant
 * de suivre l'indicateur.
 */
const PAGE = "/chiffres";

function readFigureForm(formData: FormData): VerifiedFigureInput {
  const text = (key: string) => String(formData.get(key) ?? "").trim() || null;
  return {
    label: String(formData.get("label") ?? ""),
    value: String(formData.get("value") ?? ""),
    sourceName: text("sourceName"),
    sourceUrl: text("sourceUrl"),
    asOf: text("asOf"),
    asOfDate: text("asOfDate"),
  };
}

export async function createFigureAction(formData: FormData) {
  const user = await requireUser();
  let destination = `${PAGE}#chiffres`;
  try {
    await createVerifiedFigure(user, readFigureForm(formData));
  } catch (error) {
    destination = withError(destination, await errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

export async function updateFigureAction(id: string, formData: FormData) {
  const user = await requireUser();
  let destination = `${PAGE}#chiffre-${id}`;
  try {
    await updateVerifiedFigure(user, id, readFigureForm(formData));
  } catch (error) {
    destination = withError(`${PAGE}#chiffres`, await errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

export async function deleteFigureAction(id: string) {
  const user = await requireUser();
  let destination = `${PAGE}#chiffres`;
  try {
    await deleteVerifiedFigure(user, id);
  } catch (error) {
    destination = withError(destination, await errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

/** Suivre un indicateur : abonnement, lecture immédiate si besoin, copie datée et sourcée dans les chiffres. */
export async function followIndicatorAction(key: string) {
  const user = await requireUser();
  let destination = PAGE;
  try {
    await followIndicator(user, key);
    if (user.organizationId) await refreshOrganizationIndicators(user.organizationId);
  } catch (error) {
    destination = withError(destination, await errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

export async function unfollowIndicatorAction(key: string) {
  const user = await requireUser();
  let destination = PAGE;
  try {
    await unfollowIndicator(user, key);
  } catch (error) {
    destination = withError(destination, await errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

/** « Suivre les indicateurs de mon métier » — idempotent. */
export async function followPackIndicatorsAction() {
  const t = await getTranslations("figures.actions");
  const user = await requireUser();
  let destination = PAGE;
  try {
    if (!user.organizationId) throw new AppError("aucune_organisation_selectionnee");
    const org = await getOwnOrganization(user);
    const { pack } = resolveBusinessPack(org?.businessPack);
    const added = await followPackIndicators(user.organizationId, pack.watch.indicators);
    await refreshOrganizationIndicators(user.organizationId);
    destination = withError(
      PAGE,
      added === 0 ? t("tous_les_indicateurs_de_ton_metier_dde4") : t("indicateur_indicateurs_suivi_suivis_lu_lus_ede8", { added }),
      "info"
    );
  } catch (error) {
    destination = withError(destination, await errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

/** Relit maintenant les indicateurs suivis (même s'ils ont été lus il y a moins d'un jour). */
export async function refreshIndicatorsAction() {
  const t = await getTranslations("figures.actions");
  const user = await requireUser();
  let destination = PAGE;
  try {
    if (!user.organizationId) throw new AppError("aucune_organisation_selectionnee");
    const read = await refreshOrganizationIndicators(user.organizationId, { force: true });
    destination = withError(PAGE, t("indicateur_indicateurs_relu_relus_aupres_de_2c94", { read }), "info");
  } catch (error) {
    destination = withError(destination, await errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}
