import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import { NewsletterEditor } from "@/components/newsletter/editor/newsletter-editor";
import { getRenderContext } from "@/db/queries/newsletters";
import { listMailTargets } from "@/db/queries/mail-targets";
import { loadNewsletter } from "@/lib/newsletter/actions";
import { requireUser } from "@/lib/session";

export default async function EditNewsletterPage(props: PageProps<"/newsletters/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;

  const data = await loadNewsletter(id).catch(() => null);
  if (!data) {
    notFound();
  }

  const targets = await listMailTargets(user);
  const context = await getRenderContext(user, data.newsletter.targetId);

  return (
    <>
      <PageHeader
        title={data.newsletter.title}
        backTo={{ href: "/newsletters", label: "Emails" }}
      />
      <NewsletterEditor
        targets={targets.map((t) => ({ id: t.id, label: t.label }))}
        brand={context.brand}
        signatory={context.signatory}
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
    </>
  );
}
