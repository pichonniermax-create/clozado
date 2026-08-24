import { NotFoundState } from "@/components/ui/not-found-state";

/** Cette fiche n'existe pas. */
export default function ContactNotFound() {
  return (
    <NotFoundState title="Cette fiche n'existe pas." backHref="/contacts" backLabel="Retour aux contacts">
      Le lien est peut-être périmé, ou la fiche appartient à un autre espace.
    </NotFoundState>
  );
}
