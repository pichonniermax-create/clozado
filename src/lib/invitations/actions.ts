"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  createWorkspaceInvitation,
  getInvitationForSending,
  markInvitationSent,
  revokeWorkspaceInvitation,
} from "@/db/queries/workspace-invitations";
import { renderInvitationEmail } from "@/lib/email/invitation";
import { ResendError, sendEmail } from "@/lib/email/resend";
import { productSender } from "@/lib/email/sender";
import { errorMessage, withError } from "@/lib/form-actions";
import { invitationUrl } from "@/lib/invitations/token";
import { log } from "@/lib/log";
import { requestOrigin } from "@/lib/request-origin";
import { requireSessionUser } from "@/lib/session";

const PAGE = "/invitations";

/**
 * Les gestes du super admin sur les invitations d'espaces
 * (docs/module-invitations.md §1.3). Le super admin RÉEL, jamais la
 * substitution (`requireSessionUser`) : une invitation n'appartient à
 * aucune organisation. Le retour suit la convention du produit — l'erreur
 * ou l'information en paramètre d'URL, montrée une fois.
 */

/** Génère le lien : redirige vers la liste avec l'invitation mise en avant (le lien à copier, et l'envoi par email). */
export async function createInvitationAction(formData: FormData) {
  let destination = PAGE;
  try {
    const user = await requireSessionUser();
    const { invitation } = await createWorkspaceInvitation(user, {
      organizationName: String(formData.get("organizationName") ?? ""),
      email: String(formData.get("email") ?? ""),
      locale: String(formData.get("locale") ?? "fr"),
      validityDays: String(formData.get("validityDays") ?? ""),
      note: String(formData.get("note") ?? ""),
    });
    destination = `${PAGE}?nouvelle=${invitation.id}`;
  } catch (error) {
    destination = withError(PAGE, await errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

export async function revokeInvitationAction(formData: FormData) {
  const t = await getTranslations("invitations.actions");
  let destination = PAGE;
  try {
    const user = await requireSessionUser();
    await revokeWorkspaceInvitation(user, String(formData.get("id") ?? ""));
    destination = withError(PAGE, t("revoquee"), "info");
  } catch (error) {
    destination = withError(PAGE, await errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}

/**
 * Envoie (ou renvoie) l'email d'invitation à l'adresse réservée, par le
 * client Resend du produit — l'expéditeur du produit, la langue de
 * l'invitation. Un envoi refusé par le fournisseur est journalisé et dit à
 * l'écran ; le lien reste copiable à la main.
 */
export async function sendInvitationEmailAction(formData: FormData) {
  const t = await getTranslations("invitations.actions");
  let destination = PAGE;
  try {
    const user = await requireSessionUser();
    const id = String(formData.get("id") ?? "");
    const { invitation, email, token, locale } = await getInvitationForSending(user, id);
    const url = invitationUrl(await requestOrigin(), token);
    const rendered = await renderInvitationEmail({ locale, organizationName: invitation.organizationName, url, expiresAt: invitation.expiresAt });
    // Une clé d'idempotence par envoi : un renvoi volontaire est un nouvel email, pas un doublon à absorber.
    await sendEmail({ from: productSender().from, to: [email], subject: rendered.subject, html: rendered.html, text: rendered.text }, `invitation/${id}/${Date.now()}`);
    await markInvitationSent(user, id);
    destination = withError(PAGE, t("envoyee", { email }), "info");
  } catch (error) {
    log.error("invitation_email_failed", { error });
    // Un refus du fournisseur n'est pas une AppError : la phrase dédiée, plutôt que le message générique.
    destination = withError(PAGE, error instanceof ResendError ? t("envoi_refuse") : await errorMessage(error));
  }
  revalidatePath(PAGE);
  redirect(destination);
}
