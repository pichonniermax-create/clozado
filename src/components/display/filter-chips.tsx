import Link from "next/link";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * LES FILTRES ACTIFS, EN PASTILLES RETIRABLES (lot 1, étape 4) — ce qui
 * restreint la liste est DIT, et se retire d'un clic. Sans cela, une
 * recherche oubliée ou un filtre venu d'une vue laissait croire à une base
 * vide. Chaque pastille est un lien : le même écran, ce filtre en moins.
 */
export type FilterChip = { key: string; label: string; href: string };

export function FilterChips({ chips, clearHref, clearLabel, className }: { chips: FilterChip[]; clearHref?: string; clearLabel: string; className?: string }) {
  if (chips.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={chip.href}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-muted"
        >
          {chip.label}
          <X className="size-3 text-muted-foreground" aria-hidden />
          <span className="sr-only">{clearLabel}</span>
        </Link>
      ))}
      {chips.length > 1 && clearHref && (
        <Link href={clearHref} className="rounded-full px-2 py-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
          {clearLabel}
        </Link>
      )}
    </div>
  );
}
