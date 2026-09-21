import { PageSkeleton, SkeletonCard } from "@/components/ui/skeleton";

/** Squelette de l'aperçu : la barre des vues, le cadre de l'email, la liste du contrôle. */
export default function NewsletterPreviewLoading() {
  return (
    <PageSkeleton back>
      <div className="flex flex-col gap-6">
        <SkeletonCard className="h-9" />
        <SkeletonCard className="h-[58vh]" />
        <SkeletonCard className="h-96" />
      </div>
    </PageSkeleton>
  );
}
