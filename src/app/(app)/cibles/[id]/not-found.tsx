import { NotFoundState } from "@/components/ui/not-found-state";

export default function TargetNotFound() {
  return (
    <NotFoundState title="Cette cible n'existe pas." backHref="/cibles" backLabel="Voir les cibles">
      Le lien est peut-être périmé, ou la cible a été créée dans un autre espace.
    </NotFoundState>
  );
}
