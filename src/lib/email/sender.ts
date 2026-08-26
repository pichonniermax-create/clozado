import type { Organization } from "@/db/schema";
import { bareAddress, formatMailbox } from "./address";

/**
 * L'expéditeur des emails envoyés POUR une organisation (chantier marque
 * blanche, étape 3). Son nom d'expéditeur — sinon son nom — devant
 * l'adresse du produit ; son adresse à elle en Reply-To tant que son
 * domaine d'envoi n'est pas vérifié (un fournisseur refuse d'envoyer depuis
 * un domaine qu'il n'a pas vérifié : l'email partirait en spam, ou ne
 * partirait pas), en From une fois qu'il l'est.
 *
 * Aucun email ne part encore au nom d'une organisation : la newsletter est
 * marquée envoyée à la main, et le lien de connexion est celui du produit
 * (la connexion reste Clozado). Ce résolveur est le point de passage
 * obligé du premier qui partira — les emails système de l'étape 5.
 */
export type EmailSender = {
  /** L'en-tête From, prêt à poser. */
  from: string;
  /** L'en-tête Reply-To, ou null quand les réponses vont naturellement au From. */
  replyTo: string | null;
};

export type SenderOrganization = Pick<Organization, "name" | "senderName" | "senderEmail" | "emailDomain" | "emailDomainVerifiedAt">;

/** L'adresse depuis laquelle le produit envoie — la même que le lien de connexion (Auth.js), une par produit. */
export function productMailbox(): string {
  return process.env.EMAIL_FROM ?? "onboarding@resend.dev";
}

export function emailSender(org: SenderOrganization, product: string = productMailbox()): EmailSender {
  const displayName = org.senderName?.trim() || org.name;
  const own = org.senderEmail?.trim().toLowerCase() || null;
  const domain = org.emailDomain?.trim().toLowerCase() || null;
  const verified = Boolean(own && domain && org.emailDomainVerifiedAt && own.endsWith(`@${domain}`));
  if (own && verified) return { from: formatMailbox(displayName, own), replyTo: null };
  return { from: formatMailbox(displayName, bareAddress(product)), replyTo: own };
}
