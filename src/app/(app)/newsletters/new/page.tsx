import Link from "next/link";
import { PageHeader } from "@/components/app-shell/page-header";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { NewsletterEditor, type EditorSource } from "@/components/newsletter/editor/newsletter-editor";
import { countMembersByTarget, listMailTargets } from "@/db/queries/mail-targets";
import { getRenderContext } from "@/db/queries/newsletters";
import { describeGapSubject, listBasket, type WatchItemRow } from "@/db/queries/watch";
import { requestOrigin } from "@/lib/request-origin";
import { requireUser } from "@/lib/session";
import { buildBasketBrief, buildGapBrief } from "@/lib/watch/brief";
import { isCompetitorAngle } from "@/lib/watch/gap";
import { getTranslations } from "next-intl/server";
import { getFormats } from "@/i18n/formats";
import { settingsOfOrganization } from "@/i18n/locale-lookup";
import { translatorFor } from "@/i18n/translator";
import { createFormats, PRODUCT_FORMATS } from "@/lib/format";

function toEditorSources(items: WatchItemRow[]): EditorSource[] {
  return items.map((b) => ({
    id: b.id,
    title: b.title,
    url: b.url,
    publisher: b.publisher,
    publishedAt: b.publishedAt?.toISOString() ?? null,
    summary: b.summary,
  }));
}

export default async function NewNewsletterPage({
  searchParams,
}: {
  /** `cible` : la cible présélectionnée (« Écrire une newsletter pour cette cible ») ; `panier` : partir des articles mis de côté ; `sujet` : partir d'un sujet de l'écart de contenu. */
  searchParams: Promise<{ cible?: string; panier?: string; sujet?: string }>;
}) {
  const tr = await getTranslations("newsletters.new");
  const fmt = await getFormats();
  const user = await requireUser();
  const settings = user.organizationId ? await settingsOfOrganization(user.organizationId) : PRODUCT_FORMATS;
  const contentLocale = settings.locale;
  const { cible, panier, sujet } = await searchParams;
  const targets = await listMailTargets(user);
  let sources: EditorSource[] = [];
  let initialBrief: string | undefined;
  if (panier && user.organizationId) {
    // La matière du panier : titres, liens, dates et nos résumés — rattachés à
    // l'email dès son premier enregistrement (« déjà utilisé » dans la veille).
    const basket = await listBasket(user);
    sources = toEditorSources(basket);
    initialBrief = sources.length > 0 ? buildBasketBrief(basket, fmt) : undefined;
  } else if (sujet?.trim() && user.organizationId) {
    // L'écart de contenu : de tes concurrents, le sujet et les angles pris —
    // rien d'autre ; la matière est la nôtre (nos articles sur ce sujet). Le
    // brief est une consigne au modèle : dans la langue des contenus, avec
    // les formats de l'organisation.
    const [context, tw] = await Promise.all([describeGapSubject(user, sujet.trim()), translatorFor(contentLocale, "watch")]);
    sources = toEditorSources(context.ownItems);
    initialBrief = buildGapBrief(
      {
        subject: context.subject,
        competitors: context.competitors,
        articles: context.articles,
        angles: context.angles.filter(isCompetitorAngle).map((angle) => tw(`angles.${angle}`)),
        ownItems: context.ownItems,
      },
      tw,
      createFormats(settings)
    );
  }
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
        lang={contentLocale}
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
