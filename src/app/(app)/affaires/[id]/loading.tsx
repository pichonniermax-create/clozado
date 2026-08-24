import { PageSkeleton, SkeletonCard } from "@/components/ui/skeleton";

/** Squelette de la fiche affaire. */
export default function DealLoading() {
  return (
    <PageSkeleton back titleWidth="w-72" description={false}>
      <SkeletonCard className="h-56" />
      <SkeletonCard />
    </PageSkeleton>
  );
}
