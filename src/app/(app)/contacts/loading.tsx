import { PageSkeleton, Skeleton, SkeletonList } from "@/components/ui/skeleton";

/** Squelette de la liste des contacts. */
export default function ContactsLoading() {
  return (
    <PageSkeleton>
      <Skeleton className="h-11 rounded-xl" />
      <Skeleton className="h-8 w-64" />
      <SkeletonList rows={8} />
    </PageSkeleton>
  );
}
