import Link from "next/link";
import { errorMessage, withError } from "@/lib/form-actions";
import { redirect } from "next/navigation";
import { ChevronRight, Plus, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListCard } from "@/components/ui/list-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { PageHeader } from "@/components/app-shell/page-header";
import { parseAudienceSnapshot } from "@/db/queries/newsletters";
import { deleteNewsletter, listNewsletters } from "@/lib/newsletter/actions";
import { getFormats } from "@/i18n/formats";
import { requireUser } from "@/lib/session";
import { getTranslations } from "next-intl/server";

export default async function NewslettersPage() {
  const t = await getTranslations("newsletters.list");
  const fmt = await getFormats();
  const user = await requireUser();

  // Vue globale du super admin (stabilisation, S4) : le seul écran d'« Outils » qui mélangeait toutes les
  // organisations — le même état que les cibles, les règles, les emails reçus.
  if (!user.organizationId) {
    return (
      <>
        <PageHeader tour="newsletters" title={t("newsletters")} description={t("les_emails_que_tu_prepares_pour_b188")} />
        <EmptyState>{t("tu_es_en_vue_globale_choisis_f905")}</EmptyState>
      </>
    );
  }

  const items = await listNewsletters();

  return (
    <>
      <PageHeader
        tour="newsletters"
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
        <ListCard>
          {items.map((n) => {
            const snapshot = n.sentAt ? parseAudienceSnapshot(n.audienceSnapshot) : null;
            return (
              // Le titre garde la largeur (min-w-0, deux lignes sous sm) ; le statut vit sur la ligne du sous-titre — avant, badge
              // + « Supprimer » + chevron le réduisaient à douze caractères sur un téléphone.
              <li key={n.id} className="flex items-center gap-1 pr-2">
                <Link href={`/newsletters/${n.id}`} className="flex min-w-0 flex-1 flex-col px-4 py-3 transition-colors hover:bg-accent/40">
                  <span className="line-clamp-2 text-sm font-medium sm:line-clamp-none sm:truncate">{n.title}</span>
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground tabular-nums">
                    {n.sentAt ? (
                      <StatusBadge tone="success">{n.sendMode === "sent" ? t("envoyee") : t("marquee_envoyee")}</StatusBadge>
                    ) : (
                      <StatusBadge>{t("brouillon")}</StatusBadge>
                    )}
                    <span className="min-w-0 truncate">
                      {n.subject ?? t("objet_a_ecrire")}{" "}
                      {n.sentAt
                        ? t("envoyee_le", { formatDate: fmt.date(n.sentAt), value: snapshot ? t("a_contact_contacts", { count: snapshot.count, label: snapshot.label }) : "" })
                        : t("modifiee_le", { formatDateTime: fmt.dateTime(n.updatedAt) })}
                    </span>
                  </span>
                </Link>
                <div className="flex shrink-0 items-center gap-1">
                  {/* Le créateur seul peut supprimer (garde d'auteur) : la corbeille n'est montrée qu'à lui (stabilisation, E6). */}
                  {!n.sentAt && n.createdBy === user.id && (
                    <>
                      {/* La suppression est définitive : une confirmation, et une icône plutôt qu'un mot qui écrasait le titre.
                          Le formulaire vit hors du dialogue (portail) : le bouton du dialogue le vise par `form=`. */}
                      <form
                        id={`delete-${n.id}`}
                        action={async () => {
                          "use server";
                          let destination = "/newsletters";
                          try {
                            await deleteNewsletter(n.id);
                          } catch (error) {
                            destination = withError("/newsletters", await errorMessage(error));
                          }
                          redirect(destination);
                        }}
                      />
                      <AlertDialog>
                        <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" type="button" aria-label={t("supprimer")} />}>
                          <Trash2 />
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t("supprimer_ce_brouillon")}</AlertDialogTitle>
                            <AlertDialogDescription>{t("suppression_definitive")}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("annuler")}</AlertDialogCancel>
                            <AlertDialogAction variant="destructive" type="submit" form={`delete-${n.id}`}>
                              {t("supprimer")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                </div>
              </li>
            );
          })}
        </ListCard>
      )}
    </>
  );
}
