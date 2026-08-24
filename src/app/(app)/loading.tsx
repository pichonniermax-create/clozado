import { PageSkeleton, SkeletonCard, SkeletonList } from "@/components/ui/skeleton";

/** Squelette générique des écrans internes — sert aux routes sans squelette propre. */
export default function AppLoading() {
  return (
    <PageSkeleton>
      <SkeletonCard />
      <SkeletonList rows={5} />
    </PageSkeleton>
  );
}
