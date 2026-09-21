import type { EmailMessage } from "@/db/schema";

/**
 * LES EN-TÊTES D'UN ENVOI, à part : ce sont des fonctions pures, elles se
 * testent sans base (la remise, elle, parle au fournisseur et à la base).
 */

/** Le marqueur laissé dans le rendu à la place du lien de désinscription, propre à chaque message. */
export const UNSUBSCRIBE_PLACEHOLDER = "%%CLOZADO_UNSUBSCRIBE%%";

/**
 * La substitution du marqueur par l'adresse de désinscription — la MÊME
 * fonction pour la remise et pour l'aperçu (chantier envoi, partie 3) :
 * c'est ce qui rend vraie la phrase « le HTML de l'aperçu est le HTML
 * envoyé », au lien propre à chaque message près.
 */
export function withUnsubscribeUrl(text: string, url: string): string {
  return text.split(UNSUBSCRIBE_PLACEHOLDER).join(url);
}

/** Les adresses de désinscription d'un message : la page (dans le pied de page) et la route en un clic (en-tête `List-Unsubscribe`). */
export function unsubscribeUrls(origin: string, messageId: string): { page: string; oneClick: string } {
  return { page: `${origin}/desinscription/${messageId}`, oneClick: `${origin}/api/unsubscribe/${messageId}` };
}

/**
 * L'EN-TÊTE `Feedback-ID` (Gmail Postmaster Tools) : c'est lui qui permet
 * de lire le taux de plainte PAR nature d'envoi, PAR organisation et PAR
 * vague, au lieu d'un seul chiffre pour tout le domaine — et donc de
 * savoir QUI déclenche la pause automatique des seuils.
 *
 * Google impose la forme `a:b:c:SenderId` : au plus quatre champs séparés
 * par `:`, le DERNIER identifie l'expéditeur, le tout sous 127 caractères.
 * Les identifiants sont des UUID et des étiquettes internes : aucune
 * donnée personnelle ne part dans un en-tête lu par une messagerie.
 * <https://support.google.com/mail/answer/6254652>
 */
export function feedbackId(message: Pick<EmailMessage, "kind" | "organizationId" | "sendId">): string {
  return `${message.kind}:${message.organizationId}:${message.sendId ?? "seul"}:clozado`;
}
