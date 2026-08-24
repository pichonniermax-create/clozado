import { PageSkeleton, SkeletonCard, SkeletonList, SkeletonSectionTitle } from "@/components/ui/skeleton";

/** Squelette des écrans analytiques. */
export default function AnalyticsLoading() {
  return (
    <PageSkeleton titleWidth="w-48">
      <SkeletonSectionTitle />
      <SkeletonList rows={3} />
      <SkeletonSectionTitle />
      <SkeletonCard />
    </PageSkeleton>
  );
}
