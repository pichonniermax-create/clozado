import { NotFoundState } from "@/components/ui/not-found-state";

/** Cette affaire n'existe pas. */
export default function DealNotFound() {
  return (
    <NotFoundState title="Cette affaire n'existe pas." backHref="/affaires" backLabel="Retour aux affaires">
      Le lien est peut-être périmé, ou l&apos;affaire appartient à un autre espace.
    </NotFoundState>
  );
}
