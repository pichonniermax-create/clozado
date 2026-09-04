import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import { NewsletterEditor } from "@/components/newsletter/editor/newsletter-editor";
import { SEND_ERROR_PARAM } from "@/components/newsletter/labels";
import { SendStatusCard } from "@/components/newsletter/send-status-card";
import { countMembersByTarget, getMailTarget, listMailTargets } from "@/db/queries/mail-targets";
import { getRenderContext, listNewsletterSources } from "@/db/queries/newsletters";
import { loadNewsletter } from "@/lib/newsletter/actions";
import { requestOrigin } from "@/lib/request-origin";
import { requireSessionUser, requireUser } from "@/lib/session";
import { countSendableMembers, countSentSince, getCampaignStats, getLatestSend, listTestMessages, sendPhase } from "@/db/queries/email-sends";
import { getOrganizationOfRecord } from "@/db/queries/organizations";
import { getUserProfile } from "@/db/queries/users";
import { sharedSendingDomain } from "@/lib/email/config";
import { missingFooterFacts } from "@/lib/email/footer";
import { resolveSender } from "@/lib/email/sender";
import { getTranslations } from "next-intl/server";
import { settingsOfOrganization } from "@/i18n/locale-lookup";
import { DEFAULT_LOCALE } from "@/i18n/locales";

export default async function EditNewsletterPage(props: PageProps<"/newsletters/[id]">) {
  const tr = await getTranslations("newsletters.detail");
  const user = await requireUser();
  const contentLocale = user.organizationId ? (await settingsOfOrganization(user.organizationId)).locale : DEFAULT_LOCALE;
  const { id } = await props.params;
  const query = await props.searchParams;
  const sendError = query[SEND_ERROR_PARAM];

  const data = await loadNewsletter(id).catch(() => null);
  if (!data) {
    notFound();
  }

  const origin = await requestOrigin();
  const [targets, context, sources] = await Promise.all([
    listMailTargets(user),
    getRenderContext(user, data.newsletter.targetId, origin),
    listNewsletterSources(user, data.newsletter.id),
  ]);

  // Une newsletter peut viser une cible désactivée depuis : elle reste
  // proposée dans le sélecteur, marquée comme telle, plutôt qu'un choix vide.
  let editorTargets = targets;
  if (!targets.some((t) => t.id === data.newsletter.targetId)) {
    const current = await getMailTarget(user, data.newsletter.targetId).catch(() => null);
    if (current) editorTargets = [...targets, current];
  }
  const counts = await countMembersByTarget(editorTargets);

  // La carte d'envoi (chantier engagement) : l'envoi en cours ou terminé, ses agrégats, les tests, l'expéditeur effectif, l'audience réelle.
  const session = await requireSessionUser();
  const org = await getOrganizationOfRecord(user, data.newsletter.organizationId);
  const currentTarget = editorTargets.find((t) => t.id === data.newsletter.targetId) ?? null;
  const [send, tests, profile, sendable, sentToday] = await Promise.all([
    getLatestSend(data.newsletter.id),
    listTestMessages(data.newsletter.id),
    getUserProfile(session.id),
    currentTarget && !data.newsletter.sentAt ? countSendableMembers(currentTarget) : Promise.resolve(0),
    countSentSince(new Date(new Date().setUTCHours(0, 0, 0, 0))),
  ]);
  const stats = data.newsletter.sendMode === "sent" ? await getCampaignStats(data.newsletter.id, org.id) : null;
  const phase = sendPhase(send);
  let sender = null;
  let sharedDomain = "";
  try {
    sharedDomain = sharedSendingDomain();
    const resolved = resolveSender(org, profile);
    sender = { from: resolved.from, replyTo: resolved.replyTo, fallback: resolved.fallback, sharedDomain };
  } catch {
    // Sans EMAIL_SHARED_DOMAIN, la carte refuse d'envoyer et le dit (pas d'expéditeur).
    sender = null;
  }

  return (
    <>
      <PageHeader
        title={data.newsletter.title}
        backTo={{ href: "/newsletters", label: tr("newsletters") }}
      />
      <NewsletterEditor
        lang={contentLocale}
        targets={editorTargets.map((t) => ({
          id: t.id,
          label: t.archivedAt ? tr("desactivee", { label: t.label }) : t.label,
          count: counts.get(t.id) ?? 0,
        }))}
        brand={context.brand}
        signatory={context.signatory}
        allowedFigures={context.allowedFigures}
        sources={sources.map((s) => ({ ...s, publishedAt: s.publishedAt?.toISOString() ?? null }))}
        initial={{
          id: data.newsletter.id,
          targetId: data.newsletter.targetId,
          title: data.newsletter.title,
          subject: data.newsletter.subject ?? "",
          preheader: data.newsletter.preheader ?? "",
          brief: data.newsletter.brief ?? "",
          blocks: data.blocks,
          topics: data.newsletter.topics,
        }}
      />
      <SendStatusCard
        newsletter={data.newsletter}
        send={send}
        stats={stats}
        tests={tests}
        sender={sender}
        audience={currentTarget ? { total: counts.get(currentTarget.id) ?? 0, sendable } : null}
        footerMissing={missingFooterFacts(org).length > 0}
        simulated={org.isDemo}
        sentToday={sentToday}
        phase={phase}
        error={typeof sendError === "string" ? sendError : undefined}
      />
    </>
  );
}
