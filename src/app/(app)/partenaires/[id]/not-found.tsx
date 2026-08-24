import { NotFoundState } from "@/components/ui/not-found-state";

/** Ce partenaire n'existe pas. */
export default function PartnerNotFound() {
  return (
    <NotFoundState title="Ce partenaire n'existe pas." backHref="/partenaires" backLabel="Retour aux partenaires">
      Le lien est peut-être périmé, ou la fiche appartient à un autre espace.
    </NotFoundState>
  );
}
