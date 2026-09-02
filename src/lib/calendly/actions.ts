"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { disconnectCalendarConnection, saveCalendarConnection } from "@/db/queries/calendar-connections";
import { createCalendlyWebhook, getCalendlyUser } from "@/lib/calendly/api";
import { encryptSecret } from "@/lib/crypto";
import { publicOrigin } from "@/lib/email/config";
import { AppError } from "@/lib/errors";
import { errorMessage, withError } from "@/lib/form-actions";
import { requireSessionUser } from "@/lib/session";

/**
 * La connexion Calendly d'une personne (§5.1) : son jeton d'accès
 * personnel sert UNE fois — `GET /users/me` puis la création de
 * l'abonnement webhook (portée `user`, clé de signature générée par
 * nous) — et n'est jamais conservé. La connexion appartient à la
 * personne et à SON organisation (jamais celle d'une substitution
 * super admin : l'id et l'organisation viennent de la session réelle).
 */

export async function connectCalendlyAction(formData: FormData) {
  const t = await getTranslations("profile");
  const session = await requireSessionUser();
  let destination = withError("/profil", t("calendly.connectee_les_rendez_vous_arriveront_tout_seuls"), "info");
  try {
    if (!session.organizationId) throw new AppError("aucune_organisation_selectionnee");
    const token = String(formData.get("token") ?? "").trim();
    if (!token) throw new AppError("colle_d_abord_ton_jeton_calendly");
    const calendlyUser = await getCalendlyUser(token);
    // 256 bits d'aléa, en hexadécimal : la clé avec laquelle Calendly signera chaque webhook.
    const signingKey = randomBytes(32).toString("hex");
    const { subscriptionUri } = await createCalendlyWebhook(token, {
      callbackUrl: `${await publicOrigin()}/api/webhooks/calendly`,
      userUri: calendlyUser.uri,
      organizationUri: calendlyUser.organizationUri,
      signingKey,
    });
    await saveCalendarConnection({
      organizationId: session.organizationId,
      userId: session.id,
      externalUserUri: calendlyUser.uri,
      externalOrganizationUri: calendlyUser.organizationUri,
      subscriptionUri,
      signingKeyEncrypted: encryptSecret(signingKey, "calendly-signing-key"),
    });
  } catch (error) {
    destination = withError("/profil", await errorMessage(error));
  }
  revalidatePath("/profil");
  redirect(destination);
}

export async function disconnectCalendlyAction() {
  const t = await getTranslations("profile");
  const session = await requireSessionUser();
  let destination = withError("/profil", t("calendly.deconnectee_pense_a_retirer_le_webhook"), "info");
  try {
    await disconnectCalendarConnection(session.id);
  } catch (error) {
    destination = withError("/profil", await errorMessage(error));
  }
  revalidatePath("/profil");
  redirect(destination);
}
