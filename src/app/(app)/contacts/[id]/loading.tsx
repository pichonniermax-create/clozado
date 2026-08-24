import { PageSkeleton, SkeletonCard, SkeletonSectionTitle } from "@/components/ui/skeleton";

/** Squelette de la fiche contact. */
export default function ContactLoading() {
  return (
    <PageSkeleton back titleWidth="w-64">
      <SkeletonCard className="h-72" />
      <SkeletonSectionTitle />
      <SkeletonCard className="h-32" />
    </PageSkeleton>
  );
}
