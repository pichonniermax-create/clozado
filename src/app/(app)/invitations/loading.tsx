import { PageSkeleton, SkeletonCard, SkeletonList } from "@/components/ui/skeleton";

/** La silhouette de /invitations : l'en-tête, le formulaire replié, la liste. */
export default function InvitationsLoading() {
  return (
    <PageSkeleton>
      <SkeletonCard />
      <SkeletonList rows={4} />
    </PageSkeleton>
  );
}
