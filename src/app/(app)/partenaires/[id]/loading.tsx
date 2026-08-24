import { PageSkeleton, SkeletonCard, SkeletonList, SkeletonSectionTitle } from "@/components/ui/skeleton";

/** Squelette de la fiche partenaire. */
export default function PartnerLoading() {
  return (
    <PageSkeleton back titleWidth="w-64" description={false}>
      <SkeletonCard className="h-72" />
      <SkeletonSectionTitle />
      <SkeletonList rows={3} />
    </PageSkeleton>
  );
}
