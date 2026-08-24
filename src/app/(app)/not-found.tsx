import { NotFoundState } from "@/components/ui/not-found-state";

/** Cette page n'existe pas dans ton espace. */
export default function AppNotFound() {
  return (
    <NotFoundState title="Cette page n'existe pas dans ton espace." backHref="/dashboard" backLabel="Retour au tableau de bord">
      Le lien est peut-être périmé, ou la page appartient à un autre espace.
    </NotFoundState>
  );
}
