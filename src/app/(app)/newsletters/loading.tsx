import { PageSkeleton, SkeletonList } from "@/components/ui/skeleton";

/** Squelette de la liste des newsletters : la zone centrale ne reste plus vide pendant la lecture. */
export default function NewslettersLoading() {
  return (
    <PageSkeleton>
      <SkeletonList rows={5} />
    </PageSkeleton>
  );
}
