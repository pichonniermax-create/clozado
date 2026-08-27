import { after } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { newsletterBlocks, newsletterSends, newsletters } from "@/db/schema";
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
import { buildAudienceSnapshot, getNewsletterOrThrow, getRenderContext, normalizeTopics } from "@/db/queries/newsletters";
import { getOrganizationOfRecord } from "@/db/queries/organizations";
import { getUserProfile } from "@/db/queries/users";
import { translatorFor } from "@/i18n/translator";
import { toAppLocale } from "@/i18n/locales";
import { AppError } from "@/lib/errors";
import { parseBlockPayload, NEWSLETTER_OUTPUT_SCHEMA, type AnyBlock } from "@/lib/newsletter/blocks";
import { renderNewsletterHtml, renderNewsletterText } from "@/lib/newsletter/render-email";
import type { OrgScopeUser } from "@/lib/session";
import { deliverMessages, UNSUBSCRIBE_PLACEHOLDER, type SendContent } from "./deliver";
import { buildFooter, missingFooterFacts } from "./footer";
import { resolveSender } from "./sender";

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

async function loadBlocks(newsletterId: string): Promise<AnyBlock[]> {
  const rows = await db.select().from(newsletterBlocks).where(eq(newsletterBlocks.newsletterId, newsletterId)).orderBy(asc(newsletterBlocks.position));
  return rows.map((row) => ({ type: row.type, ...parseBlockPayload(row.type, row.payload) }) as AnyBlock);
}

/**
 * Prépare ce qui partira : contrôles (objet, blocs aboutis, faits du pied
 * de page), rendu HTML et texte avec le marqueur de désinscription,
 * expéditeur et adresse de réponse. `test` relâche le contrôle du pied de
 * page (un test peut partir avant que l'adresse postale soit saisie) et
 * pose l'avertissement de test dans le pied de page.
 */
export async function prepareNewsletterEmail(user: OrgScopeUser, sessionUserId: string, newsletterId: string, origin: string, options: { test: boolean }): Promise<Prepared> {
  const newsletter = await getNewsletterOrThrow(user, newsletterId);
  const org = await getOrganizationOfRecord(user, newsletter.organizationId);
  const blocks = await loadBlocks(newsletterId);
  const subject = newsletter.subject?.trim() ?? "";
  if (!subject) throw new AppError("l_objet_est_vide_ecris_le_avant_d_envoyer");
  // Le niveau « aboutie » des blocs, de l'objet et de l'aperçu — les sujets, eux, sont posés par l'envoi.
  const finished = NEWSLETTER_OUTPUT_SCHEMA.omit({ topics: true }).safeParse({ subject, preheader: newsletter.preheader ?? "", blocks });
  if (!finished.success) throw new AppError("la_newsletter_n_est_pas_finie_un_bloc_est_vide");
  if (!options.test && missingFooterFacts(org).length > 0) throw new AppError("l_adresse_postale_manque_au_pied_de_page");

  const [context, profile] = await Promise.all([getRenderContext(user, newsletter.targetId, origin), getUserProfile(sessionUserId)]);
  const sender = resolveSender(org, profile);
  if (!sender.replyTo) throw new AppError("aucune_adresse_de_reponse");
  const footer = await buildFooter(org, context.locale, { unsubscribeUrl: UNSUBSCRIBE_PLACEHOLDER }, { test: options.test });
  const input = { brand: context.brand, subject, preheader: newsletter.preheader ?? "", blocks, signatory: context.signatory, footer, lang: context.locale };
  const html = renderNewsletterHtml(input);
  const text = renderNewsletterText(input);
  return { newsletter, org, blocks, subject, content: { html, text }, from: sender.from, replyTo: sender.replyTo, fallback: sender.fallback };
}

// ---------------------------------------------------------------------------
// Le départ
// ---------------------------------------------------------------------------

/** « Envoyer » : prépare, fige, crée l'envoi et ses messages, et lance l'exécutant après la réponse. */
export async function launchNewsletterSend(user: OrgScopeUser, sessionUserId: string, newsletterId: string, origin: string): Promise<{ sendId: string; queued: number }> {
  const prepared = await prepareNewsletterEmail(user, sessionUserId, newsletterId, origin, { test: false });
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
  let rateLimitRetries = 0;

  while (true) {
    if (Date.now() - started > STOP_AFTER_MS) {
      await releaseLease(sendId);
      return "yielded";
    }
    const batch: EmailMessage[] = await nextQueuedMessages(sendId, BATCH_SIZE);
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

export async function sendTestEmail(user: OrgScopeUser, session: { id: string; email: string }, newsletterId: string, origin: string): Promise<EmailMessage> {
  const prepared = await prepareNewsletterEmail(user, session.id, newsletterId, origin, { test: true });
  const tEmail = await translatorFor(toAppLocale(prepared.org.defaultLocale), "email.test");
  const message = await createTestMessage({
    organizationId: prepared.org.id,
    newsletterId,
    toEmail: session.email,
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
