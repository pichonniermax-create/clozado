import { getMailTarget } from "@/db/queries/mail-targets";
import { audienceBreakdown, listTestMessages } from "@/db/queries/email-sends";
import { sendingAllowance, type SendingAllowance } from "@/db/queries/sending-health";
import { settingsOfOrganization } from "@/i18n/locale-lookup";
import { blockingRows, preflightRows, type AudienceBreakdown, type PreflightRow } from "@/lib/newsletter/preflight";
import type { OrgScopeUser } from "@/lib/session";
import { marketingSendingDomain } from "./config";
import { UNSUBSCRIBE_PLACEHOLDER } from "./deliver";
import { buildSendDraft, type SendDraft } from "./send-draft";

/**
 * LE CONTRÔLE AVANT ENVOI, côté serveur (chantier envoi, partie 3) : il
 * rassemble les faits — le rendu réel, l'expéditeur, le pied de page, qui
 * recevra vraiment, ce que le quota du jour laisse passer, le dernier test
 * — et les donne à la revue déterministe (`lib/newsletter/preflight.ts`).
 *
 * Il sert DEUX appelants, et c'est le point : l'écran d'aperçu l'affiche,
 * et `launchNewsletterSend` le rejoue juste avant de mettre quoi que ce
 * soit en file. Un envoi bloqué à l'écran l'est donc aussi à la requête —
 * une case cochée dans le navigateur ne suffit pas à passer outre.
 */

export type SendPreflightReport = {
  draft: SendDraft;
  /** La cible visée, telle qu'elle a servi au décompte — l'écran s'en sert pour lister quelques destinataires. */
  target: Awaited<ReturnType<typeof getMailTarget>>;
  rows: PreflightRow[];
  blocking: PreflightRow[];
  audience: AudienceBreakdown;
  allowance: SendingAllowance;
  lastTestAt: Date | null;
};

export async function sendPreflight(user: OrgScopeUser, sessionUserId: string, newsletterId: string, origin: string): Promise<SendPreflightReport> {
  const draft = await buildSendDraft(user, sessionUserId, newsletterId, origin, { test: false });
  const target = await getMailTarget(user, draft.newsletter.targetId);
  const settings = await settingsOfOrganization(draft.org.id);
  const [audience, allowance, tests] = await Promise.all([
    audienceBreakdown(target),
    sendingAllowance(draft.org.id, settings.timeZone),
    listTestMessages(newsletterId),
  ]);
  const lastTestAt = tests.map((t) => t.sentAt).find((at): at is Date => at !== null) ?? null;
  // Le domaine mutualisé n'existe que si la plateforme en déclare un ; sans lui, l'expéditeur est déjà nul.
  let sharedDomain: string | null = null;
  try {
    sharedDomain = marketingSendingDomain();
  } catch {
    sharedDomain = null;
  }

  const rows = preflightRows({
    subject: draft.subject,
    preheader: draft.preheader,
    blocks: draft.blocks,
    finished: draft.finished,
    html: draft.content.html,
    unsubscribeMarker: UNSUBSCRIBE_PLACEHOLDER,
    postalMissing: draft.postalMissing,
    replyTo: draft.replyTo,
    fallbackDomain: draft.fallback ? sharedDomain : null,
    from: draft.from,
    paused: allowance.paused,
    audience,
    remainingToday: allowance.remaining,
    lastTestAt,
    updatedAt: draft.newsletter.updatedAt,
  });

  return { draft, target, rows, blocking: blockingRows(rows), audience, allowance, lastTestAt };
}
