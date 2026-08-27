import { Skeleton } from "@/components/ui/skeleton";

/** La silhouette des écrans publics à carte (connexion, inscription) pendant leur chargement. */
export function PublicCardSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="flex w-full max-w-sm flex-col gap-6" aria-busy>
          <Skeleton className="h-8 w-28 self-center" />
          <Skeleton className="h-64 rounded-2xl bg-muted/60" />
        </div>
      </div>
    </div>
  );
}
