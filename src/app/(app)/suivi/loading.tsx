import { PageSkeleton, SkeletonList, SkeletonSectionTitle } from "@/components/ui/skeleton";

/** Squelette du suivi : les trois piles d'action. */
export default function FollowupLoading() {
  return (
    <PageSkeleton titleWidth="w-24">
      <SkeletonSectionTitle />
      <SkeletonList rows={2} />
      <SkeletonSectionTitle />
      <SkeletonList rows={2} />
      <SkeletonSectionTitle />
      <SkeletonList rows={2} />
    </PageSkeleton>
  );
}
