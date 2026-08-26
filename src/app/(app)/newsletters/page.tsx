import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/app-shell/page-header";
import { parseAudienceSnapshot } from "@/db/queries/newsletters";
import { deleteNewsletter, listNewsletters } from "@/lib/newsletter/actions";
import { formatDate, formatDateTime } from "@/lib/format";
import { requireUser } from "@/lib/session";

export default async function NewslettersPage() {
  await requireUser();
  const items = await listNewsletters();

  return (
    <>
      <PageHeader
        title="Newsletters"
        description="Les emails que tu prépares pour tes cibles. Un brouillon devient un envoi quand tu le marques « envoyée » : l'audience est alors figée."
        actions={
          <Link href="/newsletters/new" className={buttonVariants()}>
            <Plus />
            Nouvelle newsletter
          </Link>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="Aucune newsletter pour l'instant"
          action={
            <>
              <Link href="/newsletters/new" className={buttonVariants()}>
                Écrire la première
              </Link>
              <Link href="/cibles" className={buttonVariants({ variant: "outline" })}>
                Voir les cibles
              </Link>
            </>
          }
        >
          Choisis une cible, décris ce que l&apos;email doit dire, et le composer rédige avec l&apos;identité de la
          personne à qui tu écris.
        </EmptyState>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border bg-card">
          {items.map((n) => {
            const snapshot = n.sentAt ? parseAudienceSnapshot(n.audienceSnapshot) : null;
            return (
              <li
                key={n.id}
                className="flex items-center justify-between gap-3 border-b border-border last:border-b-0 hover:bg-accent/40"
              >
                <Link href={`/newsletters/${n.id}`} className="flex min-w-0 flex-1 flex-col px-4 py-3">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{n.title}</span>
                    {n.sentAt ? <Badge>Envoyée</Badge> : <Badge variant="secondary">Brouillon</Badge>}
                  </span>
                  <span className="truncate text-xs tabular-nums text-muted-foreground">
                    {n.subject ?? "Objet à écrire"}
                    {n.sentAt
                      ? ` · envoyée le ${formatDate(n.sentAt)}${snapshot ? ` à ${snapshot.count} contact${snapshot.count > 1 ? "s" : ""} — ${snapshot.label}` : ""}`
                      : ` · modifiée le ${formatDateTime(n.updatedAt)}`}
                  </span>
                </Link>
                <div className="flex shrink-0 items-center gap-1 pr-3">
                  {!n.sentAt && (
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
                  )}
                  <ChevronRight className="size-4 text-muted-foreground" />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
