import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { newsletterSends, newsletters } from "@/db/schema";
import type { EmailMessage, NewsletterSend, Organization } from "@/db/schema";
import {
  claimSend,
  createTestMessage,
  finishSend,
  markMessagesFailed,
  markMessagesSent,
  nextQueuedMessages,
  pauseSend,
  refreshSendCounters,
  releaseLease,
  renewLease,
  startNewsletterSend,
} from "@/db/queries/email-sends";
import { buildAudienceSnapshot, normalizeTopics } from "@/db/queries/newsletters";
import { sendingAllowance } from "@/db/queries/sending-health";
import { listMemberEmails } from "@/db/queries/inbound";
import { settingsOfOrganization } from "@/i18n/locale-lookup";
import { translatorFor } from "@/i18n/translator";
import { toAppLocale } from "@/i18n/locales";
import { AppError } from "@/lib/errors";
import type { AnyBlock } from "@/lib/newsletter/blocks";
import type { OrgScopeUser } from "@/lib/session";
import { isPlausibleEmail, isSameMailbox } from "./address";
import { deliverMessages, type SendContent } from "./deliver";
import { buildSendDraft, type SendDraft } from "./send-draft";
import { sendPreflight } from "./send-preflight";

/**
 * L'ENVOI D'UNE NEWSLETTER, de bout en bout (docs/module-engagement.md §3.3) :
 * la préparation (rendu réel, pied de page conforme, expéditeur résolu),
 * le départ atomique, l'exécutant par lots repris par le cron, l'email de
 * test. Un seul chemin de rendu pour le test et le vrai envoi : ils ne
 * peuvent pas différer.
 */

/** L'exécutant s'arrête avant la durée maximale de la fonction ; le cron reprend. */
const STOP_AFTER_MS = 240_000;
const BATCH_SIZE = 100;
const PROVIDER_UNAVAILABLE_PAUSE_MINUTES = 10;

type Prepared = {
  newsletter: typeof newsletters.$inferSelect;
  org: Organization;
  blocks: AnyBlock[];
  subject: string;
  content: SendContent;
  from: string;
  replyTo: string;
  fallback: boolean;
};

/**
 * Ce qui partira, contrôlé : le rendu vient de `buildSendDraft` (le MÊME
 * que celui de l'aperçu, docs/audit-newsletter.md §A quater), et les refus
 * historiques restent posés ici — objet vide, document inachevé, adresse
 * postale absente, adresse de réponse absente. Ce sont des
 * invariants de dernière ligne : le contrôle avant envoi les a déjà vus et
 * a déjà refusé l'envoi (`launchNewsletterSend`) ; s'ils remontent
 * jusqu'ici, c'est qu'on a été appelé sans lui.
 *
 * `test` relâche le contrôle du pied de page (un test peut partir avant que
 * l'adresse postale soit saisie) et pose l'avertissement de test.
 */
export async function prepareNewsletterEmail(user: OrgScopeUser, sessionUserId: string, newsletterId: string, origin: string, options: { test: boolean }): Promise<Prepared> {
  return assertSendable(await buildSendDraft(user, sessionUserId, newsletterId, origin, options), options);
}

function assertSendable(draft: SendDraft, options: { test: boolean }): Prepared {
  if (!draft.subject) throw new AppError("l_objet_est_vide_ecris_le_avant_d_envoyer");
  if (!draft.finished) throw new AppError("la_newsletter_n_est_pas_finie_un_bloc_est_vide");
  if (!options.test && draft.postalMissing) throw new AppError("l_adresse_postale_manque_au_pied_de_page");
  if (!draft.replyTo || !draft.from) throw new AppError("aucune_adresse_de_reponse");
  return { newsletter: draft.newsletter, org: draft.org, blocks: draft.blocks, subject: draft.subject, content: draft.content, from: draft.from, replyTo: draft.replyTo, fallback: draft.fallback };
}

// ---------------------------------------------------------------------------
// Le départ
// ---------------------------------------------------------------------------

/** « Envoyer » : prépare, fige, crée l'envoi et ses messages, et lance l'exécutant après la réponse. */
export async function launchNewsletterSend(user: OrgScopeUser, sessionUserId: string, newsletterId: string, origin: string): Promise<{ sendId: string; queued: number }> {
  /**
   * LE CONTRÔLE AVANT ENVOI EST REJOUÉ ICI (chantier envoi, partie 3) — la
   * liste affichée à l'écran ne protège que l'écran. Un bloquant refuse
   * l'envoi côté serveur, quelle que soit la case cochée dans le
   * navigateur, et la personne est renvoyée vers la liste qui le dit.
   */
  const report = await sendPreflight(user, sessionUserId, newsletterId, origin);
  if (report.blocking.length > 0) {
    throw new AppError("le_controle_avant_envoi_bloque_cet_envoi", { count: report.blocking.length });
  }
  const prepared = assertSendable(report.draft, { test: false });
  if (prepared.newsletter.sentAt) throw new AppError("cette_newsletter_est_deja_marquee_envoyee");
  const t = await translatorFor(toAppLocale(prepared.org.defaultLocale), "targets");
  const { target, snapshot } = await buildAudienceSnapshot(prepared.newsletter, t);
  const started = await startNewsletterSend({
    newsletterId,
    organizationId: prepared.org.id,
    target,
    snapshot,
    topics: normalizeTopics(prepared.newsletter.topics.length > 0 ? prepared.newsletter.topics : [prepared.subject]),
    startedBy: sessionUserId,
    subject: prepared.subject,
    html: prepared.content.html,
    textBody: prepared.content.text,
    from: prepared.from,
    replyTo: prepared.replyTo,
  });
  if (started.queued === 0) {
    await finishSend(started.sendId);
    return started;
  }
  // Le bail a été pris au départ : l'exécutant part tout de suite, après la réponse.
  after(async () => {
    await runSend(started.sendId, origin, { alreadyClaimed: true });
  });
  return started;
}

/** « Reprendre » (bouton) ou le cron : prend le bail si personne ne l'a, et exécute. */
export function scheduleSendResume(sendId: string, origin: string): void {
  after(async () => {
    await runSend(sendId, origin, { alreadyClaimed: false });
  });
}

// ---------------------------------------------------------------------------
// L'exécutant
// ---------------------------------------------------------------------------

function quotaResetDate(code: string): Date {
  const now = new Date();
  if (code === "monthly_quota_exceeded") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 5));
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 5));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type RunOutcome = "finished" | "paused" | "yielded" | "busy";

/**
 * Traite les messages en file, par lots, jusqu'à la fin, une pause ou la
 * limite de temps. Chaque lot : remise au fournisseur, résultats écrits,
 * compteurs recomptés, bail prolongé. Le fournisseur qui dit « quota » met
 * l'envoi en pause jusqu'au prochain jour ou mois ; « trop vite » attend le
 * délai demandé ; « indisponible » met en pause dix minutes.
 */
export async function runSend(sendId: string, origin: string, options: { alreadyClaimed: boolean }): Promise<RunOutcome> {
  const started = Date.now();
  let send: NewsletterSend | null = null;
  if (options.alreadyClaimed) {
    send = (await db.select().from(newsletterSends).where(eq(newsletterSends.id, sendId)).limit(1))[0] ?? null;
  } else {
    send = await claimSend(sendId);
  }
  if (!send || send.finishedAt) return "busy";
  const content: SendContent = { html: send.html, text: send.textBody };
  const settings = await settingsOfOrganization(send.organizationId);
  let rateLimitRetries = 0;

  while (true) {
    if (Date.now() - started > STOP_AFTER_MS) {
      await releaseLease(sendId);
      return "yielded";
    }
    /**
     * LES GARDE-FOUS D'ENVOI (chantier envoi), relus AVANT CHAQUE LOT et
     * non une fois au départ : une plainte reçue pendant la vague doit
     * l'arrêter, pas être découverte à la fin.
     *
     * - l'organisation en pause (seuils dépassés, ou geste du super admin) :
     *   la vague s'arrête et attend une décision humaine — la reprise
     *   n'est pas automatique, elle se fait après nettoyage ;
     * - le quota du jour (abaissé par la montée progressive) : la vague
     *   reprend demain, d'elle-même, par le cron.
     */
    const allowance = await sendingAllowance(send.organizationId, settings.timeZone);
    if (allowance.paused) {
      await refreshSendCounters(sendId);
      // Loin devant : seule une reprise manuelle (ou la fin de la pause) relancera l'envoi.
      await pauseSend(sendId, new Date(Date.now() + 365 * 86_400_000), `organisation_en_pause: ${allowance.pauseReason ?? ""}`.slice(0, 200));
      return "paused";
    }
    if (allowance.remaining <= 0) {
      await refreshSendCounters(sendId);
      await pauseSend(sendId, quotaResetDate("daily_quota_exceeded"), `quota_du_jour: ${allowance.quota}`);
      return "paused";
    }
    const batch: EmailMessage[] = await nextQueuedMessages(sendId, Math.min(BATCH_SIZE, allowance.remaining));
    if (batch.length === 0) {
      await refreshSendCounters(sendId);
      await finishSend(sendId);
      return "finished";
    }
    const outcome = await deliverMessages(batch, content, origin);
    switch (outcome.status) {
      case "sent": {
        await markMessagesSent(outcome.results);
        const delivered = new Set(outcome.results.map((r) => r.id));
        const missing = batch.filter((m) => !delivered.has(m.id)).map((m) => m.id);
        if (missing.length > 0) await markMessagesFailed(missing, "provider_rejected");
        await refreshSendCounters(sendId);
        await renewLease(sendId);
        rateLimitRetries = 0;
        break;
      }
      case "rejected":
        await markMessagesFailed(batch.map((m) => m.id), outcome.reason);
        await refreshSendCounters(sendId);
        break;
      case "quota":
        await refreshSendCounters(sendId);
        await pauseSend(sendId, quotaResetDate(outcome.code), outcome.code);
        return "paused";
      case "rate_limited":
        rateLimitRetries += 1;
        if (rateLimitRetries > 3) {
          await pauseSend(sendId, new Date(Date.now() + PROVIDER_UNAVAILABLE_PAUSE_MINUTES * 60_000), "rate_limited");
          return "paused";
        }
        await sleep(Math.min(outcome.retryAfterSeconds, 10) * 1000);
        break;
      case "unavailable":
        await pauseSend(sendId, new Date(Date.now() + PROVIDER_UNAVAILABLE_PAUSE_MINUTES * 60_000), `provider_unavailable: ${outcome.reason}`.slice(0, 200));
        return "paused";
    }
  }
}

// ---------------------------------------------------------------------------
// L'email de test — vers la personne connectée, jamais vers un contact
// ---------------------------------------------------------------------------

/**
 * L'email de test part à SOI, ou à un membre de l'organisation — jamais à
 * un contact (chantier envoi, partie 3 ; doctrine : « aucun email de test
 * vers une adresse autre que les siennes »). Le sous-adressage est accepté
 * (`claire+relecture@…` est la boîte de `claire@…`) : on teste sur un
 * alias sans ouvrir la porte à une adresse quelconque. La vérification est
 * ICI, côté serveur : le champ de l'écran ne protège que l'écran.
 */
export async function sendTestEmail(
  user: OrgScopeUser,
  session: { id: string; email: string },
  newsletterId: string,
  origin: string,
  requestedTo?: string
): Promise<EmailMessage> {
  const prepared = await prepareNewsletterEmail(user, session.id, newsletterId, origin, { test: true });
  const toEmail = (requestedTo ?? "").trim() || session.email;
  const allowed = [session.email, ...(await listMemberEmails(prepared.org.id))];
  if (!isPlausibleEmail(toEmail) || !isSameMailbox(toEmail, allowed)) throw new AppError("un_test_ne_part_qu_a_toi_ou_a_un_membre");
  const tEmail = await translatorFor(toAppLocale(prepared.org.defaultLocale), "email.test");
  const message = await createTestMessage({
    organizationId: prepared.org.id,
    newsletterId,
    toEmail,
    from: prepared.from,
    replyTo: prepared.replyTo,
    subject: `${tEmail("subject_prefix")}${prepared.subject}`,
    createdBy: session.id,
  });
  const outcome = await deliverMessages([message], prepared.content, origin);
  if (outcome.status === "sent" && outcome.results.length > 0) {
    await markMessagesSent(outcome.results);
    return message;
  }
  const reason = outcome.status === "sent" ? "provider_rejected" : outcome.status === "quota" ? outcome.code : outcome.status === "rate_limited" ? "rate_limited" : outcome.reason;
  await markMessagesFailed([message.id], reason);
  throw new AppError("l_email_de_test_n_est_pas_parti", { reason });
}
