import { PageSkeleton, SkeletonCard, SkeletonList, SkeletonSectionTitle } from "@/components/ui/skeleton";

/** Squelette de l'écran des tâches — la génération et la liste chargent côté serveur. */
export default function TasksLoading() {
  return (
    <PageSkeleton titleWidth="w-32">
      <SkeletonCard className="h-44" />
      <SkeletonSectionTitle />
      <SkeletonList rows={5} />
    </PageSkeleton>
  );
}
