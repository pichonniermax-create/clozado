import { PageSkeleton, SkeletonCard } from "@/components/ui/skeleton";

/** Squelette d'une newsletter : la barre de l'éditeur, puis le document. */
export default function NewsletterLoading() {
  return (
    <PageSkeleton back description={false}>
      <SkeletonCard className="h-12" />
      <SkeletonCard className="h-[32rem]" />
    </PageSkeleton>
  );
}
