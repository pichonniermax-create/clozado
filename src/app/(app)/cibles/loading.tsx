import { PageSkeleton, SkeletonList } from "@/components/ui/skeleton";

/** Squelette de la liste des cibles. */
export default function TargetsLoading() {
  return (
    <PageSkeleton>
      <SkeletonList rows={5} />
    </PageSkeleton>
  );
}
