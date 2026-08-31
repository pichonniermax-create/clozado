import { getTranslations } from "next-intl/server";
import { createActivity } from "@/db/queries/activities";
import { createContact, getContact } from "@/db/queries/contacts";
import { getInboundEmail, markInboundConfirmed, stopAutoSendOnReply } from "@/db/queries/inbound";
import { AppError } from "@/lib/errors";
import type { OrgScopeUser } from "@/lib/session";

/**
 * LA CONFIRMATION d'un email reçu (docs/module-engagement.md §4.3) — le
 * SEUL endroit où l'ingestion écrit sur une fiche, et seulement sur le
 * geste d'une personne. Deux chemins : rattacher à une fiche existante (qui
 * n'est jamais modifiée — la proposition ne réécrit pas ce qui est déjà
 * là), ou créer la fiche avec les champs affichés, tels que la personne les
 * a corrigés. Puis l'interaction : un email daté du message d'origine, dans
 * son sens (`inbound` = il vient du contact, `outbound` = il part vers
 * lui) ; un email entrant arrête l'envoi automatique, motif `replied`.
 */

export type ConfirmInboundInput = {
  /** La fiche à rattacher ; null = créer une fiche avec les champs ci-dessous. */
  contactId: string | null;
  /**
   * Le sens, quand le parseur n'a pas su trancher (`mode` nul) : c'est la
   * personne qui le dit. Rien ne le devine à sa place — se tromper poserait
   * une réponse entrante là où il n'y en a pas, et arrêterait l'envoi
   * automatique tout seul.
   */
  direction?: "inbound" | "outbound" | null;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
};

/** Le journal consigne ce qui a eu lieu : une date d'origine mal lue ne doit pas devenir une interaction à venir. */
function usableDate(candidate: Date | null, fallback: Date): Date {
  if (!candidate || Number.isNaN(candidate.getTime())) return fallback;
  return candidate.getTime() > Date.now() ? fallback : candidate;
}

export async function confirmInboundEmail(user: OrgScopeUser, sessionUserId: string, id: string, input: ConfirmInboundInput): Promise<{ contactId: string }> {
  const t = await getTranslations("inbound.activity");
  const row = await getInboundEmail(user, id);
  if (row.status !== "pending") throw new AppError("cet_email_a_deja_ete_traite");

  const name = input.name.trim();
  if (!input.contactId && !name) throw new AppError("une_fiche_a_besoin_d_un_nom");

  const contact = input.contactId
    ? await getContact(user, input.contactId)
    : await createContact(user, sessionUserId, {
        kind: "person",
        name,
        email: input.email?.trim().toLowerCase() || null,
        phone: input.phone?.trim() || null,
        companyName: input.company?.trim() || null,
        jobTitle: input.jobTitle?.trim() || null,
        source: "manual",
      });

  // Le sens de l'email : un transfert porte l'email du contact (il nous
  // parle), une copie porte le nôtre (nous lui parlons) ; sans mode reconnu,
  // c'est la personne qui tranche.
  const direction = row.mode === "copy" ? "outbound" : row.mode === "forward" ? "inbound" : input.direction;
  if (!direction) throw new AppError("precise_si_cet_email_vient_du_contact_ou_part_vers_lui");
  const who = row.senderEmail;
  const subject = row.subject?.trim() || t("sans_objet");
  const activity = await createActivity(user, sessionUserId, {
    type: "email",
    content: direction === "inbound" ? t("transfere_par", { subject, who }) : t("copie_de", { subject, who }),
    occurredAt: usableDate(row.originalDate, row.receivedAt),
    contactId: contact.id,
    direction,
  });

  await markInboundConfirmed(user, id, { contactId: contact.id, activityId: activity.id, confirmedBy: sessionUserId });
  // Une réponse du contact arrête l'envoi automatique (§5.3) — jamais réarmé par l'ingestion.
  if (direction === "inbound") await stopAutoSendOnReply(row.organizationId, contact.id);
  return { contactId: contact.id };
}
