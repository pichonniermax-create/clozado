import Link from "next/link";
import { PageHeader } from "@/components/app-shell/page-header";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { NewsletterEditor } from "@/components/newsletter/editor/newsletter-editor";
import { countMembersByTarget, listMailTargets } from "@/db/queries/mail-targets";
import { getRenderContext } from "@/db/queries/newsletters";
import { listBasket } from "@/db/queries/watch";
import { requestOrigin } from "@/lib/request-origin";
import { requireUser } from "@/lib/session";
import { buildBasketBrief } from "@/lib/watch/brief";
import { getTranslations } from "next-intl/server";

export default async function NewNewsletterPage({
  searchParams,
}: {
  /** `cible` : la cible présélectionnée (« Écrire une newsletter pour cette cible ») ; `panier` : partir des articles mis de côté. */
  searchParams: Promise<{ cible?: string; panier?: string }>;
}) {
  const tr = await getTranslations("newsletters.new");
  const user = await requireUser();
  const { cible, panier } = await searchParams;
  const targets = await listMailTargets(user);
  // La matière du panier : titres, liens, dates et nos résumés — rattachés à
  // l'email dès son premier enregistrement (« déjà utilisé » dans la veille).
  const basket = panier && user.organizationId ? await listBasket(user) : [];
  const sources = basket.map((b) => ({
    id: b.id,
    title: b.title,
    url: b.url,
    publisher: b.publisher,
    publishedAt: b.publishedAt?.toISOString() ?? null,
    summary: b.summary,
  }));
  const initialBrief = sources.length > 0 ? buildBasketBrief(basket) : undefined;
  const initialTargetId = targets.some((t) => t.id === cible) ? cible : undefined;

  // La marque doit être connue AVANT toute saisie : l'éditeur affiche le
  // squelette de l'email dès l'ouverture, pas une zone vide. Elle est
  // résolue depuis une cible — toutes appartiennent à la même organisation,
  // donc à la même marque.
  const first = initialTargetId ?? targets[0]?.id;
  const origin = await requestOrigin();
  const [context, counts] = await Promise.all([
    first ? getRenderContext(user, first, origin) : Promise.resolve(null),
    countMembersByTarget(targets),
  ]);

  if (!context) {
    return (
      <>
        <PageHeader title={tr("nouvelle_newsletter")} backTo={{ href: "/newsletters", label: tr("newsletters") }} />
        <EmptyState
          title={tr("aucune_cible_pour_l_instant")}
          action={
            <Link href="/cibles" className={buttonVariants()}>
              {tr("creer_une_cible")}
            </Link>
          }
        >
          {tr("un_email_s_ecrit_pour_quelqu_76e5")}
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title={tr("nouvelle_newsletter")} backTo={{ href: "/newsletters", label: tr("newsletters") }} />
      <NewsletterEditor
        targets={targets.map((t) => ({ id: t.id, label: t.label, count: counts.get(t.id) ?? 0 }))}
        initialTargetId={initialTargetId}
        initialBrief={initialBrief}
        sources={sources}
        brand={context.brand}
        signatory={context.signatory}
      />
    </>
  );
}
