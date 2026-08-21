import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/app-shell/page-header";
import { deleteNewsletter, listNewsletters } from "@/lib/newsletter/actions";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/lib/session";

export default async function NewslettersPage() {
  await requireUser();
  const items = await listNewsletters();

  return (
    <>
      <PageHeader
        title="Newsletters"
        description="Les emails que tu prépares pour tes contacts."
        actions={
          <Link href="/newsletters/new" className={buttonVariants()}>
            <Plus />
            Nouvelle newsletter
          </Link>
        }
      />

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Aucune newsletter pour l&apos;instant.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border bg-card">
          {items.map((n) => (
            <li
              key={n.id}
              className="flex items-center justify-between gap-3 border-b border-border last:border-b-0 hover:bg-accent/40"
            >
              <Link href={`/newsletters/${n.id}`} className="flex min-w-0 flex-1 flex-col px-4 py-3">
                <span className="truncate text-sm font-medium">{n.title}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {n.subject ?? "Objet à écrire"} · modifiée le {formatDateTime(n.updatedAt)}
                </span>
              </Link>
              <div className="flex shrink-0 items-center gap-1 pr-3">
                <form
                  action={async () => {
                    "use server";
                    await deleteNewsletter(n.id);
                    redirect("/newsletters");
                  }}
                >
                  <Button variant="ghost" size="sm" type="submit">
                    Supprimer
                  </Button>
                </form>
                <ChevronRight className="size-4 text-muted-foreground" />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
