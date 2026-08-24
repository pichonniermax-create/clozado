import { PageSkeleton, SkeletonCard, SkeletonSectionTitle, SkeletonTiles } from "@/components/ui/skeleton";

/** Squelette du tableau de bord — deux rangées de tuiles, puis les listes. */
export default function DashboardLoading() {
  return (
    <PageSkeleton titleWidth="w-56">
      <SkeletonTiles />
      <SkeletonTiles />
      <SkeletonSectionTitle />
      <SkeletonCard />
      <SkeletonSectionTitle />
      <SkeletonCard className="h-32" />
    </PageSkeleton>
  );
}
