"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { deleteOrganizationAssets, upsertOrganizationAsset } from "@/db/queries/organization-assets";
import { errorMessage, withError } from "@/lib/form-actions";
import { requireUser } from "@/lib/session";
import { decodePngDataUrl, readPngSize } from "./assets";

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
  if (!bytes) throw new Error(`${label} : l'image n'a pas pu être lue — réessaie avec un PNG, un JPEG, un WebP ou un SVG.`);
  const size = readPngSize(bytes);
  if (!size) throw new Error(`${label} : l'image reçue n'est pas un PNG valide.`);
  if (size.width > MAX_LOGO_SIDE || size.height > MAX_LOGO_SIDE) throw new Error(`${label} : l'image est trop grande (${size.width} × ${size.height}).`);
  return { bytes, ...size };
}

export async function saveLogoAction(formData: FormData) {
  const user = await requireUser();
  let destination = `${PAGE}#logo`;
  try {
    const light = readPng(formData, "logoLight", "Logo");
    const dark = readPng(formData, "logoDark", "Logo pour fond sombre");
    const icon = readPng(formData, "icon", "Icône");
    if (!light && !dark) throw new Error("Choisis d'abord une image de logo.");
    if (light) await upsertOrganizationAsset(user, "logo_light", { mime: "image/png", ...light });
    if (dark) await upsertOrganizationAsset(user, "logo_dark", { mime: "image/png", ...dark });
    if (icon) await upsertOrganizationAsset(user, "icon", { mime: "image/png", ...icon });
    destination = withError(destination, "Logo enregistré.", "info");
  } catch (error) {
    destination = withError(destination, errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

/** « Retirer le logo » : les trois images — l'application revient à la marque Clozado par défaut. */
export async function removeLogoAction() {
  const user = await requireUser();
  let destination = `${PAGE}#logo`;
  try {
    await deleteOrganizationAssets(user);
    destination = withError(destination, "Logo retiré : la marque par défaut s'affiche.", "info");
  } catch (error) {
    destination = withError(destination, errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

/** « Retirer la version sombre » seule. */
export async function removeDarkLogoAction() {
  const user = await requireUser();
  let destination = `${PAGE}#logo`;
  try {
    await deleteOrganizationAssets(user, ["logo_dark"]);
    destination = withError(destination, "Version sombre retirée.", "info");
  } catch (error) {
    destination = withError(destination, errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}
