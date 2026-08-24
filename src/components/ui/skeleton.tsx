import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Les squelettes de chargement — l'état « ça arrive » de chaque écran
 * (`loading.tsx`). Avant, chaque route recopiait ses blocs `animate-pulse` à
 * la main ; ici ils sont composés à partir des mêmes briques, pour que tous
 * les écrans chargent avec la même silhouette : un en-tête, puis des blocs
 * qui esquissent la structure attendue (tuiles, cartes, listes, colonnes).
 * Un squelette ne dit rien ; il ne fait qu'occuper la place exacte de ce qui
 * va apparaître — d'où des hauteurs proches des vrais composants.
 */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

/** L'en-tête de page fantôme + les blocs de l'écran. `aria-busy` : les lecteurs d'écran savent que ça charge. */
export function PageSkeleton({
  back = false,
  titleWidth = "w-40",
  description = true,
  children,
}: {
  /** Une fiche : le lien « retour » au-dessus du titre. */
  back?: boolean;
  titleWidth?: string;
  description?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <div className="flex flex-col gap-3 border-b border-border pb-5">
        {back && <Skeleton className="h-4 w-24" />}
        <Skeleton className={cn("h-7", titleWidth)} />
        {description && <Skeleton className="h-4 w-96 max-w-full" />}
      </div>
      {children}
    </div>
  );
}

/** Une rangée de tuiles de statistiques (tableau de bord). */
export function SkeletonTiles({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-24 rounded-xl bg-muted/60" />
      ))}
    </div>
  );
}

/** Une carte (formulaire, fiche). */
export function SkeletonCard({ className }: { className?: string }) {
  return <Skeleton className={cn("h-40 rounded-xl bg-muted/60", className)} />;
}

/** Un titre de section. */
export function SkeletonSectionTitle({ className }: { className?: string }) {
  return <Skeleton className={cn("h-5 w-32", className)} />;
}

/** Une liste en carte : n lignes de la hauteur d'une `ListRow`. */
export function SkeletonList({ rows = 6 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-px overflow-hidden rounded-xl border border-border">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 rounded-none bg-muted/60" />
      ))}
    </div>
  );
}

/** Les colonnes fantômes du kanban. */
export function SkeletonKanban({ columns = 5 }: { columns?: number }) {
  return (
    <div className="flex gap-3 overflow-hidden">
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton key={i} className="h-72 w-64 shrink-0 rounded-xl bg-muted/60" />
      ))}
    </div>
  );
}
