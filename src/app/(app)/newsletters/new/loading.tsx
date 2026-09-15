import { PageSkeleton, SkeletonCard } from "@/components/ui/skeleton";

/** Squelette d'une newsletter neuve : la barre de l'éditeur, puis la feuille vierge. */
export default function NewNewsletterLoading() {
  return (
    <PageSkeleton back description={false}>
      <SkeletonCard className="h-12" />
      <SkeletonCard className="h-96" />
    </PageSkeleton>
  );
}
