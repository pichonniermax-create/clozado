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
import { getTranslations } from "next-intl/server";

export default async function NewslettersPage() {
  const t = await getTranslations("newsletters.list");
  await requireUser();
  const items = await listNewsletters();

  return (
    <>
      <PageHeader
        title={t("newsletters")}
        description={t("les_emails_que_tu_prepares_pour_b188")}
        actions={
          <Link href="/newsletters/new" className={buttonVariants()}>
            <Plus />
            {t("nouvelle_newsletter")}
          </Link>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title={t("aucune_newsletter_pour_l_instant")}
          action={
            <>
              {t.rich("ecrire_la_premiere_voir_les_cibles", { link: (chunks) => <Link href="/newsletters/new" className={buttonVariants()}>{chunks}</Link>, link2: (chunks) => <Link href="/cibles" className={buttonVariants({ variant: "outline" })}>{chunks}</Link> })}
            </>
          }
        >
          {t("choisis_une_cible_decris_ce_que_baa4")}
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
                    {n.sentAt ? <Badge>{t("envoyee")}</Badge> : <Badge variant="secondary">{t("brouillon")}</Badge>}
                  </span>
                  <span className="truncate text-xs tabular-nums text-muted-foreground">
                    {n.subject ?? t("objet_a_ecrire")}
                    {n.sentAt
                      ? t("envoyee_le", { formatDate: formatDate(n.sentAt), value: snapshot ? t("a_contact_contacts", { count: snapshot.count, label: snapshot.label }) : "" })
                      : t("modifiee_le", { formatDateTime: formatDateTime(n.updatedAt) })}
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
                        {t("supprimer")}
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
