import { PageSkeleton, Skeleton, SkeletonKanban } from "@/components/ui/skeleton";

/** Squelette des affaires — colonnes kanban fantômes. */
export default function DealsLoading() {
  return (
    <PageSkeleton titleWidth="w-36">
      <Skeleton className="h-11 rounded-xl" />
      <SkeletonKanban />
    </PageSkeleton>
  );
}
