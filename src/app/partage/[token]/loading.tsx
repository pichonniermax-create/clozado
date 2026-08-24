import { Skeleton } from "@/components/ui/skeleton";

/** Squelette de la vitrine de partage — neutre, sans marque tant que le partage n'est pas résolu. */
export default function ShareLoading() {
  return (
    <div className="min-h-screen bg-muted/40 px-4">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 py-10" aria-busy>
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-72 rounded-2xl bg-muted/60" />
        <Skeleton className="h-40 rounded-2xl bg-muted/60" />
      </div>
    </div>
  );
}
