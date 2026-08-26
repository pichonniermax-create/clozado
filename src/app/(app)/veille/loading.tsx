import { PageSkeleton, SkeletonList } from "@/components/ui/skeleton";

/** Squelette de la veille. */
export default function WatchLoading() {
  return (
    <PageSkeleton>
      <SkeletonList rows={6} />
    </PageSkeleton>
  );
}
