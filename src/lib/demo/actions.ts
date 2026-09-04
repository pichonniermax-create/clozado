"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { errorMessage, withError } from "@/lib/form-actions";
import { requireSessionUser } from "@/lib/session";
import { recordDemoSeed } from "./journal";
import { resetDemoOrganization } from "./reset";
import { createDemoOrganization } from "./seed";

const PAGE = "/dashboard";

/** Le super admin RÉEL, jamais la substitution : ces gestes n'appartiennent à aucune organisation. */
async function requireSuperAdmin() {
  const user = await requireSessionUser();
  if (user.role !== "super_admin") throw new AppError("reserve_au_super_admin_un_utilisateur_n_8405");
  return user;
}

/** Crée l'organisation de démo (docs/module-demo.md §1.6) — une insertion, jamais un remplacement ; journalisée. */
export async function createDemoAction() {
  const t = await getTranslations("demo.manager");
  let destination = PAGE;
  try {
    const user = await requireSuperAdmin();
    await recordDemoSeed({ requestedBy: user.id, requestedByEmail: user.email ?? null }, () => createDemoOrganization());
    destination = withError(PAGE, t("creee"), "info");
  } catch (error) {
    destination = withError(PAGE, await errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

/**
 * L'interrupteur de la démo publique (docs/module-demo.md §1.4) : ne porte
 * que sur l'organisation marquée démo — la base refuse de toute façon
 * d'ouvrir une organisation qui ne l'est pas (CHECK).
 */
export async function setDemoPublicAction(enabled: boolean) {
  const t = await getTranslations("demo.manager");
  let destination = PAGE;
  try {
    await requireSuperAdmin();
    await db.update(organizations).set({ demoPublicEnabled: enabled, updatedAt: new Date() }).where(eq(organizations.isDemo, true));
    destination = withError(PAGE, enabled ? t("ouverte_info") : t("fermee_info"), "info");
  } catch (error) {
    destination = withError(PAGE, await errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

/**
 * La réinitialisation (docs/module-demo.md §1.7, périmètre validé) : le
 * super admin RÉEL, le slug retapé comme confirmation explicite, puis
 * `resetDemoOrganization` (marquage vérifié en code ET en base, journal
 * avant/après). Le retour dit ce qui a été supprimé et recréé.
 */
export async function resetDemoAction(formData: FormData) {
  const t = await getTranslations("demo.manager");
  let destination = PAGE;
  try {
    const user = await requireSuperAdmin();
    const result = await resetDemoOrganization({
      requestedBy: user.id,
      requestedByEmail: user.email ?? null,
      confirmation: String(formData.get("confirmation") ?? ""),
    });
    destination = withError(PAGE, t("reinitialisee", { contacts: result.created.contacts ?? 0, seconds: Math.round(result.durationMs / 1000) }), "info");
  } catch (error) {
    destination = withError(PAGE, await errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}
