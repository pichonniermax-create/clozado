import { PageSkeleton, SkeletonCard } from "@/components/ui/skeleton";

/** Squelette des réglages : la marque, puis les pipelines. */
export default function SettingsLoading() {
  return (
    <PageSkeleton titleWidth="w-56">
      <SkeletonCard className="h-80 max-w-xl" />
      <SkeletonCard className="h-56" />
    </PageSkeleton>
  );
}
