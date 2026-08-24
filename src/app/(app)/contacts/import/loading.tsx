import { PageSkeleton, SkeletonCard } from "@/components/ui/skeleton";

/** Squelette de l'écran d'import. */
export default function ImportLoading() {
  return (
    <PageSkeleton back titleWidth="w-72" description={false}>
      <SkeletonCard className="h-24" />
    </PageSkeleton>
  );
}
