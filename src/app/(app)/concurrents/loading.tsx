import { PageSkeleton, SkeletonList } from "@/components/ui/skeleton";

/** Squelette des concurrents. */
export default function CompetitorsLoading() {
  return (
    <PageSkeleton>
      <SkeletonList rows={5} />
    </PageSkeleton>
  );
}
