import { PageHeader } from "@/components/app-shell/page-header";
import { NewsletterEditor } from "@/components/newsletter/editor/newsletter-editor";
import { getRenderContext } from "@/db/queries/newsletters";
import { listMailTargets } from "@/db/queries/mail-targets";
import { requireUser } from "@/lib/session";

export default async function NewNewsletterPage() {
  const user = await requireUser();
  const targets = await listMailTargets(user);

  // La marque doit être connue AVANT toute saisie : l'éditeur affiche le
  // squelette de l'email dès l'ouverture, pas une zone vide. Elle est
  // résolue depuis la première cible — toutes appartiennent à la même
  // organisation, donc à la même marque.
  const context = targets[0] ? await getRenderContext(user, targets[0].id) : null;

  if (!context) {
    return (
      <>
        <PageHeader
          title="Nouvel email"
          backTo={{ href: "/newsletters", label: "Emails" }}
        />
        <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          Aucun groupe de destinataires n&apos;est configuré pour ton organisation. Il en faut
          au moins un pour écrire un email.
        </p>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Nouvel email" backTo={{ href: "/newsletters", label: "Emails" }} />
      <NewsletterEditor
        targets={targets.map((t) => ({ id: t.id, label: t.label }))}
        brand={context.brand}
        signatory={context.signatory}
      />
    </>
  );
}
