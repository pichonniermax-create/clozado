import { PageSkeleton, SkeletonCard, SkeletonList, SkeletonSectionTitle } from "@/components/ui/skeleton";

/** Squelette des partenaires : création repliée, puis la liste. */
export default function PartnersLoading() {
  return (
    <PageSkeleton>
      <SkeletonCard className="h-12" />
      <SkeletonSectionTitle />
      <SkeletonList rows={5} />
    </PageSkeleton>
  );
}
