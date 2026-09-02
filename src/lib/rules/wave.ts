import { getSuppression } from "@/db/queries/email-events";
import { markMessagesFailed, markMessagesSent } from "@/db/queries/email-sends";
import { getContact } from "@/db/queries/contacts";
import { getOwnOrganizationOrThrow } from "@/db/queries/newsletters";
import {
  cancelDraft,
  countAutomaticSentInPeriod,
  getRuleDraft,
  listAutomaticDraftRows,
  markDraftQueued,
  quotaPauseActive,
  revertQueuedToDraft,
} from "@/db/queries/rules";
import { toAppLocale } from "@/i18n/locales";
import { translatorFor } from "@/i18n/translator";
import { deliverMessages } from "@/lib/email/deliver";
import { missingFooterFacts } from "@/lib/email/footer";
import { AppError } from "@/lib/errors";
import { ruleEmailRenderer } from "@/lib/rules/render";
import type { OrgScopeUser } from "@/lib/session";

/**
 * LA VAGUE (garde-fou du 2026-09-02, non négociable) : les emails
 * automatiques préparés par l'évaluation ne partent QUE d'ici — après
 * qu'un humain a relu l'écran et cliqué. Chaque garde-fou est RE-vérifié
 * par message (l'état a pu changer depuis la préparation) : un message
 * recalé passe `canceled` avec son motif, visible sur la fiche. La remise
 * passe par le chemin commun (pied de page, désinscription par message,
 * suivi) ; un fournisseur en panne ou à quota rend les messages à la
 * vague et arrête proprement — rien n'est perdu, rien ne part deux fois
 * (clé d'idempotence par message).
 */

export type WaveResult = { sent: number; canceled: number; failed: number; remaining: number };

export async function sendAutomaticWave(user: OrgScopeUser, origin: string, filter: { ruleId?: string } = {}): Promise<WaveResult> {
  const org = await getOwnOrganizationOrThrow(user);
  if (!org.autoSendEnabled) throw new AppError("l_interrupteur_general_est_coupe");
  if (missingFooterFacts(org).length > 0) throw new AppError("l_adresse_postale_manque_au_pied_de_page");
  if (await quotaPauseActive(org.id)) throw new AppError("une_pause_d_envoi_est_active");

  const locale = toAppLocale(org.defaultLocale);
  const t = await translatorFor(locale, "rules.queries");
  const render = await ruleEmailRenderer(org, origin, locale);
  const drafts = await listAutomaticDraftRows(org.id, filter);

  let sent = 0;
  let canceled = 0;
  let failed = 0;
  for (const { message, contactDeletedAt, contactStoppedAt } of drafts) {
    if (!message.contactId || contactDeletedAt) {
      await cancelDraft(message.id, t("annule_fiche_supprimee"));
      canceled += 1;
      continue;
    }
    if (contactStoppedAt) {
      await cancelDraft(message.id, t("annule_arrete"));
      canceled += 1;
      continue;
    }
    if (await getSuppression(org.id, message.toEmail)) {
      await cancelDraft(message.id, t("annule_desinscrit"));
      canceled += 1;
      continue;
    }
    if ((await countAutomaticSentInPeriod(org.id, message.contactId, org.autoSendPeriodDays)) > 0) {
      await cancelDraft(message.id, t("annule_plafond"));
      canceled += 1;
      continue;
    }

    // Brouillon → file : le WHERE sur le statut fait qu'une vague concurrente ne prend jamais le même message.
    if (!(await markDraftQueued(message.id))) continue;
    const content = render(message.subject, message.body ?? "");
    let outcome = await deliverMessages([{ ...message, status: "queued" }], content, origin);
    if (outcome.status === "rate_limited") {
      const waitSeconds = Math.min(outcome.retryAfterSeconds, 10);
      await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
      outcome = await deliverMessages([{ ...message, status: "queued" }], content, origin);
    }
    if (outcome.status === "sent") {
      await markMessagesSent(outcome.results);
      sent += 1;
      continue;
    }
    if (outcome.status === "rejected") {
      await markMessagesFailed([message.id], outcome.reason);
      failed += 1;
      continue;
    }
    // Quota atteint, fournisseur muet ou toujours trop vite : le message redevient un brouillon, la vague s'arrête proprement.
    await revertQueuedToDraft(message.id);
    if (outcome.status === "quota") throw new AppError("le_quota_du_fournisseur_est_atteint_la_vague_reprendra");
    throw new AppError("le_fournisseur_d_envoi_ne_repond_pas_reessaie");
  }

  const remaining = (await listAutomaticDraftRows(org.id, filter)).length;
  return { sent, canceled, failed, remaining };
}

/**
 * L'envoi d'UN brouillon depuis la fiche (Envoyer · Modifier · Ignorer,
 * §5.2) — un geste HUMAIN : les garde-fous de l'automatique (arrêt,
 * plafond, interrupteur) s'appliquent aux brouillons `automatic` ; un
 * brouillon `manual`, envoyé sciemment par une personne, ne vérifie que
 * l'irrévocable — la désinscription — et l'état du fournisseur.
 */
export async function sendRuleDraft(user: OrgScopeUser, origin: string, messageId: string): Promise<void> {
  const org = await getOwnOrganizationOrThrow(user);
  if (missingFooterFacts(org).length > 0) throw new AppError("l_adresse_postale_manque_au_pied_de_page");
  if (await quotaPauseActive(org.id)) throw new AppError("une_pause_d_envoi_est_active");

  const draft = await getRuleDraft(user, messageId);
  const locale = toAppLocale(org.defaultLocale);
  const t = await translatorFor(locale, "rules.queries");
  const contact = draft.contactId ? await getContact(user, draft.contactId) : null;
  if (!contact || contact.deletedAt) {
    await cancelDraft(draft.id, t("annule_fiche_supprimee"));
    throw new AppError("ce_contact_a_ete_supprime");
  }
  if (await getSuppression(org.id, draft.toEmail)) {
    await cancelDraft(draft.id, t("annule_desinscrit"));
    throw new AppError("cette_adresse_est_desinscrite_rien_ne_partira");
  }
  if (draft.kind === "automatic") {
    if (!org.autoSendEnabled) throw new AppError("l_interrupteur_general_est_coupe");
    if (contact.autoSendStoppedAt) {
      await cancelDraft(draft.id, t("annule_arrete"));
      throw new AppError("les_envois_automatiques_de_ce_contact_sont_arretes");
    }
    if ((await countAutomaticSentInPeriod(org.id, contact.id, org.autoSendPeriodDays)) > 0) {
      await cancelDraft(draft.id, t("annule_plafond"));
      throw new AppError("le_plafond_de_ce_contact_est_atteint");
    }
  }

  if (!(await markDraftQueued(draft.id))) throw new AppError("brouillon_introuvable_ou_deja_traite", undefined, 404);
  const render = await ruleEmailRenderer(org, origin, locale);
  const content = render(draft.subject, draft.body ?? "");
  const outcome = await deliverMessages([{ ...draft, status: "queued" }], content, origin);
  if (outcome.status === "sent") {
    await markMessagesSent(outcome.results);
    return;
  }
  if (outcome.status === "rejected") {
    await markMessagesFailed([draft.id], outcome.reason);
    throw new AppError("le_fournisseur_a_refuse_ce_message", { reason: outcome.reason.slice(0, 120) });
  }
  await revertQueuedToDraft(draft.id);
  if (outcome.status === "quota") throw new AppError("le_quota_du_fournisseur_est_atteint_la_vague_reprendra");
  throw new AppError("le_fournisseur_d_envoi_ne_repond_pas_reessaie");
}
