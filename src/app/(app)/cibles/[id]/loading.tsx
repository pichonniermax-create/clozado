import { PageSkeleton, SkeletonCard, SkeletonList } from "@/components/ui/skeleton";

/** Squelette d'une cible : la définition, l'identité, la liste des contacts. */
export default function TargetLoading() {
  return (
    <PageSkeleton back>
      <SkeletonCard className="h-72" />
      <SkeletonCard className="h-56" />
      <SkeletonList rows={5} />
    </PageSkeleton>
  );
}
