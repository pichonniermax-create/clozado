"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { updateAuthSettings } from "@/db/queries/auth-settings";
import { errorMessage, withError } from "@/lib/form-actions";
import { ACTIVE_ORG_COOKIE, requireSessionUser } from "@/lib/session";
import { AppError } from "@/lib/errors";

/**
 * Choix de l'organisation active d'un super admin (bandeau de la coquille).
 * `null` = revenir à la vue globale. Le choix survit aux sessions (un an).
 */
export async function setActiveOrganizationAction(orgId: string | null) {
  const user = await requireSessionUser();
  if (user.role !== "super_admin") {
    throw new AppError("reserve_au_super_admin_un_utilisateur_n_8405");
  }
  const store = await cookies();
  if (!orgId) {
    store.delete(ACTIVE_ORG_COOKIE);
    return;
  }
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, orgId) });
  if (!org) {
    throw new AppError("cette_organisation_n_existe_pas_ou_plus_2126");
  }
  store.set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

/**
 * Les durées de la connexion (correctif du 2026-09-17) : validité du lien et
 * durée de session, en base, pour tout le produit — réservé au super admin
 * réel (jamais une substitution). Les bornes sont celles du schéma ; une
 * valeur hors bornes revient à l'écran avec sa phrase.
 */
export async function updateAuthSettingsAction(formData: FormData) {
  const t = await getTranslations("dashboard.authSettings");
  const user = await requireSessionUser();
  if (user.role !== "super_admin") throw new AppError("acces_refuse_seul_l_admin_de_l_bed5", undefined, 403);
  let destination = "/dashboard";
  try {
    await updateAuthSettings({ linkValidityMinutes: Number(formData.get("linkValidityMinutes")), sessionDays: Number(formData.get("sessionDays")) });
    destination = withError(destination, t("enregistre"), "info");
  } catch (error) {
    destination = withError(destination, await errorMessage(error));
  }
  revalidatePath("/dashboard");
  redirect(destination);
}
