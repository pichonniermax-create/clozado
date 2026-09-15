import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Le petit repli en ligne (« Modifier », « Ce qu'ils ont publié ») avec le
 * chevron du socle au lieu du triangle natif du navigateur : le même
 * langage de dépliage que `DetailsCard`, sur les écrans de veille, de
 * concurrents et de chiffres (audit UI du 2026-09-14 — deux marqueurs
 * cohabitaient sur la même page).
 */
export function InlineDetails({ summary, children, className, id }: { summary: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <details id={id} className={cn("group text-sm", className)}>
      <summary className="flex min-h-8 w-fit cursor-pointer list-none items-center gap-1 text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-3.5 shrink-0 transition-transform group-open:rotate-90" />
        {summary}
      </summary>
      {children}
    </details>
  );
}
