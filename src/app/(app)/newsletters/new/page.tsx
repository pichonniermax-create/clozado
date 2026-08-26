import Link from "next/link";
import { PageHeader } from "@/components/app-shell/page-header";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { NewsletterEditor } from "@/components/newsletter/editor/newsletter-editor";
import { countMembersByTarget, listMailTargets } from "@/db/queries/mail-targets";
import { getRenderContext } from "@/db/queries/newsletters";
import { requireUser } from "@/lib/session";

export default async function NewNewsletterPage({
  searchParams,
}: {
  /** `cible` : la cible présélectionnée (« Écrire une newsletter pour cette cible »). */
  searchParams: Promise<{ cible?: string }>;
}) {
  const user = await requireUser();
  const { cible } = await searchParams;
  const targets = await listMailTargets(user);
  const initialTargetId = targets.some((t) => t.id === cible) ? cible : undefined;

  // La marque doit être connue AVANT toute saisie : l'éditeur affiche le
  // squelette de l'email dès l'ouverture, pas une zone vide. Elle est
  // résolue depuis une cible — toutes appartiennent à la même organisation,
  // donc à la même marque.
  const first = initialTargetId ?? targets[0]?.id;
  const [context, counts] = await Promise.all([
    first ? getRenderContext(user, first) : Promise.resolve(null),
    countMembersByTarget(targets),
  ]);

  if (!context) {
    return (
      <>
        <PageHeader title="Nouvelle newsletter" backTo={{ href: "/newsletters", label: "Newsletters" }} />
        <EmptyState
          title="Aucune cible pour l'instant"
          action={
            <Link href="/cibles" className={buttonVariants()}>
              Créer une cible
            </Link>
          }
        >
          Un email s&apos;écrit pour quelqu&apos;un : il faut au moins une cible — un segment de tes contacts et
          l&apos;identité de la personne à qui on parle. Ton métier en propose pour commencer.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Nouvelle newsletter" backTo={{ href: "/newsletters", label: "Newsletters" }} />
      <NewsletterEditor
        targets={targets.map((t) => ({ id: t.id, label: t.label, count: counts.get(t.id) ?? 0 }))}
        initialTargetId={initialTargetId}
        brand={context.brand}
        signatory={context.signatory}
      />
    </>
  );
}
