import { PageSkeleton, SkeletonList, SkeletonTiles } from "@/components/ui/skeleton";

/** Squelette des chiffres vérifiés : les tuiles d'indicateurs puis la liste. */
export default function FiguresLoading() {
  return (
    <PageSkeleton>
      <SkeletonTiles count={6} />
      <SkeletonList rows={4} />
    </PageSkeleton>
  );
}
