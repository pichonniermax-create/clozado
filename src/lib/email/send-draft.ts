import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { newsletterBlocks, newsletters } from "@/db/schema";
import type { Organization } from "@/db/schema";
import { getNewsletterOrThrow, getRenderContext } from "@/db/queries/newsletters";
import { getOrganizationOfRecord } from "@/db/queries/organizations";
import { getUserProfile } from "@/db/queries/users";
import { NEWSLETTER_OUTPUT_SCHEMA, parseBlockPayload, type AnyBlock } from "@/lib/newsletter/blocks";
import { renderNewsletterHtml, renderNewsletterText } from "@/lib/newsletter/render-email";
import type { OrgScopeUser } from "@/lib/session";
import { UNSUBSCRIBE_PLACEHOLDER, type SendContent } from "./deliver";
import { buildFooter, missingFooterFacts } from "./footer";
import { resolveSender } from "./sender";

/**
 * CE QUI PARTIRAIT, rendu une fois — la source unique de l'envoi, de
 * l'aperçu et du contrôle avant envoi (chantier envoi, partie 3).
 *
 * Avant, seul l'envoi rendait l'email : l'aperçu de l'éditeur, lui,
 * rassemblait ses propres morceaux (pas de pied de page, pas d'expéditeur)
 * et pouvait donc mentir. Ici, UN seul chemin produit le HTML et le texte ;
 * l'aperçu montre cette chaîne-là, l'envoi remet cette chaîne-là. La seule
 * différence entre les deux est le marqueur de désinscription, remplacé
 * message par message à la remise (`deliver.ts`) — et l'aperçu le dit.
 *
 * Ce brouillon ne juge rien : il ne lève pas parce que l'objet est vide ou
 * qu'un bloc est à finir. Il rapporte les faits (`finished`,
 * `postalMissing`, `replyTo` nul) ; c'est le contrôle avant envoi
 * (`send-preflight.ts`) qui décide, et `prepareNewsletterEmail` qui refuse.
 */

export type SendDraft = {
  newsletter: typeof newsletters.$inferSelect;
  org: Organization;
  blocks: AnyBlock[];
  subject: string;
  preheader: string;
  /** Le niveau « newsletter aboutie » : aucun champ de copie vide (les sujets sont posés par l'envoi). */
  finished: boolean;
  content: SendContent;
  /** L'adresse d'expédition résolue, ou `null` quand l'organisation n'en a pas (aucun domaine d'envoi configuré). */
  from: string | null;
  replyTo: string | null;
  /** L'envoi partirait du domaine mutualisé faute de domaine vérifié. */
  fallback: boolean;
  /** Les faits du pied de page qui manquent — l'adresse postale, exigée par le profil du pays. */
  postalMissing: boolean;
  locale: string;
};

export async function loadNewsletterBlocks(newsletterId: string): Promise<AnyBlock[]> {
  const rows = await db.select().from(newsletterBlocks).where(eq(newsletterBlocks.newsletterId, newsletterId)).orderBy(asc(newsletterBlocks.position));
  return rows.map((row) => ({ type: row.type, ...parseBlockPayload(row.type, row.payload) }) as AnyBlock);
}

/**
 * Rassemble et rend. `test` relâche le pied de page (un test peut partir
 * avant que l'adresse postale soit saisie) et pose l'avertissement de test.
 */
export async function buildSendDraft(user: OrgScopeUser, sessionUserId: string, newsletterId: string, origin: string, options: { test: boolean }): Promise<SendDraft> {
  const newsletter = await getNewsletterOrThrow(user, newsletterId);
  const org = await getOrganizationOfRecord(user, newsletter.organizationId);
  const blocks = await loadNewsletterBlocks(newsletterId);
  const subject = newsletter.subject?.trim() ?? "";
  const preheader = newsletter.preheader ?? "";
  const finished = NEWSLETTER_OUTPUT_SCHEMA.omit({ topics: true }).safeParse({ subject, preheader, blocks }).success;

  const [context, profile] = await Promise.all([getRenderContext(user, newsletter.targetId, origin), getUserProfile(sessionUserId)]);
  // Sans domaine d'envoi configuré (`EMAIL_SHARED_DOMAIN`), `resolveSender` lève : ce n'est pas une panne, c'est un fait à afficher.
  let sender: { from: string; replyTo: string | null; fallback: boolean } | null = null;
  try {
    const resolved = resolveSender(org, profile);
    sender = { from: resolved.from, replyTo: resolved.replyTo || null, fallback: resolved.fallback };
  } catch {
    sender = null;
  }

  const footer = await buildFooter(org, context.locale, { unsubscribeUrl: UNSUBSCRIBE_PLACEHOLDER }, { test: options.test });
  const input = { brand: context.brand, subject, preheader, blocks, signatory: context.signatory, footer, lang: context.locale };
  return {
    newsletter,
    org,
    blocks,
    subject,
    preheader,
    finished,
    content: { html: renderNewsletterHtml(input), text: renderNewsletterText(input) },
    from: sender?.from ?? null,
    replyTo: sender?.replyTo ?? null,
    fallback: sender?.fallback ?? false,
    postalMissing: missingFooterFacts(org).length > 0,
    locale: context.locale,
  };
}
