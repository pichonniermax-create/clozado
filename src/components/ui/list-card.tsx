import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * La « liste en carte » — LE conteneur de liste du produit. Avant d'être un
 * composant, ce motif avait été recopié à la main sur sept écrans
 * (cf. docs/inventaire-ui.md §4) ; les séparateurs sont posés ici par
 * `divide-y`, une ligne n'a donc jamais à gérer ses propres bordures.
 */
export function ListCard({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      className={cn(
        "divide-y divide-border overflow-hidden rounded-xl border border-border bg-card",
        className
      )}
      {...props}
    />
  );
}

/** Ligne inerte (pas de navigation) : contenu réparti aux deux bouts, padding standard. */
export function ListRow({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      className={cn("flex items-center justify-between gap-4 px-4 py-3", className)}
      {...props}
    />
  );
}

/**
 * La « ligne cliquable » : titre + sous-titre, zone de droite pour un badge
 * ou un détail, chevron par défaut. TOUTE la surface est le lien. Le
 * sous-titre est en chiffres tabulaires : c'est là que s'empilent les
 * montants et les dates d'une ligne à l'autre. Titre et sous-titre SE
 * REPLIENT (chantier C, correctif 5) : avant, ils étaient tronqués par des
 * points de suspension — sur un téléphone, la moitié des noms et des dates
 * était coupée.
 */
export function ListRowLink({
  href,
  title,
  subtitle,
  trailing,
  chevron = true,
}: {
  href: string;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-accent/40"
      >
        <div className="flex min-w-0 flex-col">
          <span className="text-sm font-medium break-words">{title}</span>
          {subtitle && (
            <span className="text-xs tabular-nums text-muted-foreground break-words">{subtitle}</span>
          )}
        </div>
        {(trailing || chevron) && (
          <div className="flex shrink-0 items-center gap-2">
            {trailing}
            {chevron && <ChevronRight className="size-4 text-muted-foreground" />}
          </div>
        )}
      </Link>
    </li>
  );
}
