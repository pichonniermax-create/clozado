"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { confirmInboundEmail } from "./inbound/confirm";
import { markInboundIgnored } from "@/db/queries/inbound";
import { saveIngestToken, setStoreInboundBodies, updateOrganizationLegal } from "@/db/queries/organizations";
import { updateUserProfile } from "@/db/queries/users";
import { errorMessage, withError } from "@/lib/form-actions";
import { requireSessionUser, requireUser } from "@/lib/session";
import { isPlausibleEmail } from "./address";
import { checkEmailDomain, declareEmailDomain, forgetEmailDomain } from "./domain";
import { generateIngestToken } from "./inbound/address";

/**
 * Les actions serveur du chantier engagement : étape 2 — le domaine
 * d'expédition (déclarer, vérifier, retirer), les faits du pied de page, le
 * profil de la personne (adresse de réponse, lien de rendez-vous) ; étape 3
 * — l'adresse d'ingestion (créer, régénérer, conserver ou non le corps) et
 * le sort d'un email reçu (confirmer, ignorer). Toute erreur revient sur
 * l'écran appelant, en phrase.
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

// ---------------------------------------------------------------------------
// L'ingestion (étape 3) — l'adresse, puis le sort de chaque email reçu
// ---------------------------------------------------------------------------

const SETTINGS_INGEST = "/settings#ingestion";
const INBOX = "/emails-recus";

/**
 * Crée l'adresse d'ingestion, ou la REMPLACE. Le geste est le même des deux
 * côtés — un jeton neuf — mais sa conséquence n'est pas la même : régénérer
 * coupe l'ancienne adresse à l'instant, et les emails encore en route vers
 * elle seront refusés (« adresse inconnue »). L'écran le dit avant.
 */
export async function renewIngestAddressAction() {
  const user = await requireUser();
  let destination = SETTINGS_INGEST;
  try {
    await saveIngestToken(user, generateIngestToken());
  } catch (error) {
    destination = withError(SETTINGS_INGEST, await errorMessage(error));
  }
  revalidatePath("/settings");
  redirect(destination);
}

/** « Conserver le corps des emails reçus » : décoché, le corps n'est même pas écrit (§4.3). */
export async function saveInboundBodiesAction(formData: FormData) {
  const t = await getTranslations("inbound.actions");
  const user = await requireUser();
  let destination = withError(SETTINGS_INGEST, t("reglage_enregistre"), "info");
  try {
    await setStoreInboundBodies(user, formData.get("storeBodies") === "on");
  } catch (error) {
    destination = withError(SETTINGS_INGEST, await errorMessage(error));
  }
  revalidatePath("/settings");
  redirect(destination);
}

/** Confirmer : la fiche (rattachée ou créée) et l'interaction sont écrites — le seul moment où l'ingestion touche une fiche. */
export async function confirmInboundAction(formData: FormData) {
  const t = await getTranslations("inbound.actions");
  const session = await requireSessionUser();
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  let destination = withError(INBOX, t("email_confirme"), "info");
  try {
    await confirmInboundEmail(user, session.id, id, {
      contactId: String(formData.get("contactId") ?? "").trim() || null,
      direction: formData.get("direction") === "inbound" ? "inbound" : formData.get("direction") === "outbound" ? "outbound" : null,
      name: String(formData.get("name") ?? "").trim().slice(0, 160),
      email: String(formData.get("email") ?? "").trim().toLowerCase().slice(0, 254) || null,
      phone: String(formData.get("phone") ?? "").trim().slice(0, 40) || null,
      company: String(formData.get("company") ?? "").trim().slice(0, 160) || null,
      jobTitle: String(formData.get("jobTitle") ?? "").trim().slice(0, 160) || null,
    });
  } catch (error) {
    destination = withError(INBOX, await errorMessage(error));
  }
  revalidatePath(INBOX);
  revalidatePath("/contacts");
  redirect(destination);
}

/** Ignorer : rien n'est écrit nulle part, l'email passe dans « traités » avec sa trace. */
export async function ignoreInboundAction(formData: FormData) {
  const t = await getTranslations("inbound.actions");
  const session = await requireSessionUser();
  const user = await requireUser();
  let destination = withError(INBOX, t("email_ignore"), "info");
  try {
    await markInboundIgnored(user, String(formData.get("id") ?? ""), session.id);
  } catch (error) {
    destination = withError(INBOX, await errorMessage(error));
  }
  revalidatePath(INBOX);
  redirect(destination);
}
