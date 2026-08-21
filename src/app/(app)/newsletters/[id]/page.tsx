import Link from "next/link";
import { notFound } from "next/navigation";
import { Composer } from "@/components/newsletter/composer";
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

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-8">
      <div>
        <Link href="/newsletters" className="text-sm text-muted-foreground hover:underline">
          ← Retour aux newsletters
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{data.newsletter.title}</h1>
      </div>
      <Composer
        targets={targets}
        initial={{
          id: data.newsletter.id,
          targetId: data.newsletter.targetId,
          title: data.newsletter.title,
          subject: data.newsletter.subject ?? "",
          preheader: data.newsletter.preheader ?? "",
          brief: data.newsletter.brief,
          blocks: data.blocks,
        }}
      />
    </div>
  );
}
