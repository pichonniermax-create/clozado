import type { Organization, User } from "@/db/schema";
import { bareAddress, formatMailbox } from "./address";
import { productMailbox, sharedSendingDomain } from "./config";

/**
 * L'EXPÉDITEUR d'un email envoyé au nom d'une organisation — une seule
 * fonction, quatre situations (docs/module-engagement.md §3.1) :
 *
 * - domaine non vérifié (le repli) : From = « Nom d'expéditeur
 *   <slug@mail.clozado.fr> », l'adresse de l'organisation sur le
 *   sous-domaine mutualisé de la plateforme ;
 * - domaine vérifié ET `sender_email` sur ce domaine : From = « Nom
 *   d'expéditeur <sender_email> » ;
 * - domaine vérifié mais `sender_email` ailleurs (une adresse Gmail…) : le
 *   repli, et l'écran le dit ;
 * - dans tous les cas, Reply-To = une adresse RÉELLE : celle de la personne
 *   qui envoie si elle en a renseigné une, sinon l'adresse de réponse de
 *   l'organisation, sinon l'adresse de connexion de la personne — jamais
 *   chez nous.
 *
 * La bascule repli → domaine propre n'est qu'une lecture de
 * `email_domain_verified_at` au moment de l'envoi : rien à réenvoyer,
 * rien à reconfigurer.
 */
export type EmailSender = {
  /** L'en-tête From, prêt à poser. */
  from: string;
  /** L'en-tête Reply-To, toujours renseigné pour un email au nom d'une organisation. */
  replyTo: string;
  /** Le repli (sous-domaine mutualisé) est-il utilisé ? Pour le dire à l'écran. */
  fallback: boolean;
};

export type SenderOrganization = Pick<Organization, "slug" | "name" | "senderName" | "senderEmail" | "emailDomain" | "emailDomainVerifiedAt">;
export type SenderUser = Pick<User, "email" | "replyToEmail">;

/** Le domaine propre est-il utilisable comme expéditeur : vérifié, et l'adresse d'expédition dessus. */
export function ownDomainUsable(org: SenderOrganization): boolean {
  const own = org.senderEmail?.trim().toLowerCase() || null;
  const domain = org.emailDomain?.trim().toLowerCase() || null;
  return Boolean(own && domain && org.emailDomainVerifiedAt && own.endsWith(`@${domain}`));
}

/** L'adresse de l'organisation sur le sous-domaine mutualisé : `<slug>@mail.clozado.fr` — stable, unique (le slug l'est). */
export function sharedAddress(org: Pick<Organization, "slug">): string {
  return `${org.slug}@${sharedSendingDomain()}`;
}

export function resolveSender(org: SenderOrganization, user: SenderUser | null): EmailSender {
  const displayName = org.senderName?.trim() || org.name;
  const own = org.senderEmail?.trim().toLowerCase() || null;
  const personal = user?.replyToEmail?.trim().toLowerCase() || null;
  const replyTo = personal ?? own ?? user?.email?.trim().toLowerCase() ?? "";
  if (ownDomainUsable(org) && own) {
    return { from: formatMailbox(displayName, own), replyTo, fallback: false };
  }
  return { from: formatMailbox(displayName, sharedAddress(org)), replyTo, fallback: true };
}

/** L'expéditeur des emails du PRODUIT lui-même (lien de connexion, notification à une personne) : jamais au nom d'une organisation. */
export function productSender(): { from: string; address: string } {
  const mailbox = productMailbox();
  return { from: mailbox, address: bareAddress(mailbox) };
}
