"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { updateOrganizationLegal } from "@/db/queries/organizations";
import { updateUserProfile } from "@/db/queries/users";
import { errorMessage, withError } from "@/lib/form-actions";
import { requireSessionUser, requireUser } from "@/lib/session";
import { isPlausibleEmail } from "./address";
import { checkEmailDomain, declareEmailDomain, forgetEmailDomain } from "./domain";

/**
 * Les actions serveur du chantier engagement, étape 2 : le domaine
 * d'expédition (déclarer, vérifier, retirer), les faits du pied de page,
 * le profil de la personne (adresse de réponse, lien de rendez-vous).
 * Toute erreur revient sur l'écran appelant, en phrase.
 */

const SETTINGS_DOMAIN = "/settings#domaine";

export async function declareEmailDomainAction(formData: FormData) {
  const user = await requireUser();
  let destination = SETTINGS_DOMAIN;
  try {
    await declareEmailDomain(user, String(formData.get("domain") ?? ""));
  } catch (error) {
    destination = withError(SETTINGS_DOMAIN, await errorMessage(error));
  }
  revalidatePath("/settings");
  redirect(destination);
}

export async function checkEmailDomainAction() {
  const user = await requireUser();
  let destination = SETTINGS_DOMAIN;
  try {
    await checkEmailDomain(user);
  } catch (error) {
    destination = withError(SETTINGS_DOMAIN, await errorMessage(error));
  }
  revalidatePath("/settings");
  redirect(destination);
}

export async function forgetEmailDomainAction() {
  const user = await requireUser();
  let destination = SETTINGS_DOMAIN;
  try {
    await forgetEmailDomain(user);
  } catch (error) {
    destination = withError(SETTINGS_DOMAIN, await errorMessage(error));
  }
  revalidatePath("/settings");
  redirect(destination);
}

const SETTINGS_LEGAL = "/settings#pied-de-page";

/** Le pays (ISO 3166-1 alpha-2, ou vide), l'adresse postale, les mentions, la politique de confidentialité — validés ici, jamais une chaîne libre en base. */
export async function saveLegalFootprintAction(formData: FormData) {
  const t = await getTranslations("settings.page");
  const user = await requireUser();
  const country = String(formData.get("country") ?? "").trim().toUpperCase();
  if (country && !/^[A-Z]{2}$/.test(country)) redirect(withError(SETTINGS_LEGAL, t("le_pays_doit_etre_un_code_a_deux_lettres")));
  const privacy = String(formData.get("privacyPolicyUrl") ?? "").trim();
  if (privacy && !/^https?:\/\/\S+$/i.test(privacy)) redirect(withError(SETTINGS_LEGAL, t("l_adresse_de_la_politique_de_confidentialite_ne_semble_pas_valide")));
  let destination = withError(SETTINGS_LEGAL, t("pied_de_page_enregistre"), "info");
  try {
    await updateOrganizationLegal(user, {
      country: country || null,
      postalAddress: String(formData.get("postalAddress") ?? "").replace(/\r/g, "").trim().slice(0, 400) || null,
      legalMention: String(formData.get("legalMention") ?? "").replace(/\r/g, "").trim().slice(0, 600) || null,
      privacyPolicyUrl: privacy.slice(0, 500) || null,
    });
  } catch (error) {
    destination = withError(SETTINGS_LEGAL, await errorMessage(error));
  }
  revalidatePath("/settings");
  redirect(destination);
}

/** Le profil de la personne connectée — le sien, jamais celui d'une autre (l'id vient de la session). */
export async function saveProfileAction(formData: FormData) {
  const t = await getTranslations("profile");
  const session = await requireSessionUser();
  const replyTo = String(formData.get("replyToEmail") ?? "").trim().toLowerCase();
  if (replyTo && !isPlausibleEmail(replyTo)) redirect(withError("/profil", t("l_adresse_de_reponse_ne_semble_pas_valide")));
  const booking = String(formData.get("bookingUrl") ?? "").trim();
  if (booking && !/^https?:\/\/\S+$/i.test(booking)) redirect(withError("/profil", t("le_lien_de_rendez_vous_ne_semble_pas_valide")));
  let destination = withError("/profil", t("profil_enregistre"), "info");
  try {
    await updateUserProfile(session.id, { replyToEmail: replyTo || null, bookingUrl: booking.slice(0, 500) || null });
  } catch (error) {
    destination = withError("/profil", await errorMessage(error));
  }
  revalidatePath("/profil");
  redirect(destination);
}
