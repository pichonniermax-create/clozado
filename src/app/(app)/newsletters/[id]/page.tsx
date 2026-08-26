import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import { NewsletterEditor } from "@/components/newsletter/editor/newsletter-editor";
import { SEND_ERROR_PARAM } from "@/components/newsletter/labels";
import { SendStatusCard } from "@/components/newsletter/send-status-card";
import { countMembersByTarget, getMailTarget, listMailTargets } from "@/db/queries/mail-targets";
import { getRenderContext, listNewsletterSources } from "@/db/queries/newsletters";
import { loadNewsletter } from "@/lib/newsletter/actions";
import { requestOrigin } from "@/lib/request-origin";
import { requireUser } from "@/lib/session";
import { getTranslations } from "next-intl/server";

export default async function EditNewsletterPage(props: PageProps<"/newsletters/[id]">) {
  const tr = await getTranslations("newsletters.detail");
  const user = await requireUser();
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

  return (
    <>
      <PageHeader
        title={data.newsletter.title}
        backTo={{ href: "/newsletters", label: tr("newsletters") }}
      />
      <NewsletterEditor
        targets={editorTargets.map((t) => ({
          id: t.id,
          label: t.archivedAt ? tr("desactivee", { label: t.label }) : t.label,
          count: counts.get(t.id) ?? 0,
        }))}
        brand={context.brand}
        signatory={context.signatory}
        sources={sources.map((s) => ({ ...s, publishedAt: s.publishedAt?.toISOString() ?? null }))}
        initial={{
          id: data.newsletter.id,
          targetId: data.newsletter.targetId,
          title: data.newsletter.title,
          subject: data.newsletter.subject ?? "",
          preheader: data.newsletter.preheader ?? "",
          brief: data.newsletter.brief ?? "",
          blocks: data.blocks,
        }}
      />
      <SendStatusCard newsletter={data.newsletter} error={typeof sendError === "string" ? sendError : undefined} />
    </>
  );
}
