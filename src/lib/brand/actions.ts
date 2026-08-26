"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteOrganizationAssets, upsertOrganizationAsset } from "@/db/queries/organization-assets";
import { errorMessage, withError } from "@/lib/form-actions";
import { requireUser } from "@/lib/session";
import { decodePngDataUrl, readPngSize } from "./assets";
import { getTranslations } from "next-intl/server";
import { AppError } from "@/lib/errors";

/**
 * Le logo (chantier marque blanche, étape 2). Le navigateur a déjà
 * redimensionné les images et rendu des PNG (la version claire, la
 * version sombre si fournie, l'icône dérivée) ; ici on vérifie qu'on
 * reçoit bien des PNG, leur taille, leurs dimensions, et on les écrit.
 */
const PAGE = "/settings";
const MAX_LOGO_SIDE = 1600;

function readPng(formData: FormData, field: string, label: string): { bytes: Buffer; width: number; height: number } | null {
  const raw = String(formData.get(field) ?? "").trim();
  if (!raw) return null;
  const bytes = decodePngDataUrl(raw);
  if (!bytes) throw new AppError("l_image_n_a_pas_pu_etre_1169", { label });
  const size = readPngSize(bytes);
  if (!size) throw new AppError("l_image_recue_n_est_pas_un_5dfa", { label });
  if (size.width > MAX_LOGO_SIDE || size.height > MAX_LOGO_SIDE) throw new AppError("l_image_est_trop_grande", { label, width: size.width, height: size.height });
  return { bytes, ...size };
}

export async function saveLogoAction(formData: FormData) {
  const t = await getTranslations("brand.actions");
  const user = await requireUser();
  let destination = `${PAGE}#logo`;
  try {
    const light = readPng(formData, "logoLight", t("logo"));
    const dark = readPng(formData, "logoDark", t("logo_pour_fond_sombre"));
    const icon = readPng(formData, "icon", t("icone"));
    if (!light && !dark) throw new AppError("choisis_d_abord_une_image_de_logo");
    if (light) await upsertOrganizationAsset(user, "logo_light", { mime: "image/png", ...light });
    if (dark) await upsertOrganizationAsset(user, "logo_dark", { mime: "image/png", ...dark });
    if (icon) await upsertOrganizationAsset(user, "icon", { mime: "image/png", ...icon });
    destination = withError(destination, t("logo_enregistre"), "info");
  } catch (error) {
    destination = withError(destination, await errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

/** « Retirer le logo » : les trois images — l'application revient à la marque Clozado par défaut. */
export async function removeLogoAction() {
  const t = await getTranslations("brand.actions");
  const user = await requireUser();
  let destination = `${PAGE}#logo`;
  try {
    await deleteOrganizationAssets(user);
    destination = withError(destination, t("logo_retire_la_marque_par_defaut_b010"), "info");
  } catch (error) {
    destination = withError(destination, await errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

/** « Retirer la version sombre » seule. */
export async function removeDarkLogoAction() {
  const t = await getTranslations("brand.actions");
  const user = await requireUser();
  let destination = `${PAGE}#logo`;
  try {
    await deleteOrganizationAssets(user, ["logo_dark"]);
    destination = withError(destination, t("version_sombre_retiree"), "info");
  } catch (error) {
    destination = withError(destination, await errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}
