import type { ReactNode } from "react";
import { ChevronRight, Plus } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Carte repliée sur un `<details>` natif — pas de JS, pas d'état client à
 * synchroniser (choix posé sur l'écran des affaires, généralisé ici).
 * Deux usages, deux tons :
 * - `create` : un formulaire de création replié derrière un « + » (qui
 *   pivote en croix à l'ouverture) — on consulte la liste bien plus
 *   souvent qu'on ne crée ;
 * - `archive` : du contenu clos rangé derrière un chevron, volontairement
 *   discret — présent pour être retrouvé, jamais dans le champ de vision.
 */
export function DetailsCard({
  summary,
  variant = "create",
  flush = false,
  children,
}: {
  summary: ReactNode;
  variant?: "create" | "archive";
  /** Sans le padding interne — pour y glisser une liste bord à bord. */
  flush?: boolean;
  children: ReactNode;
}) {
  const Icon = variant === "create" ? Plus : ChevronRight;
  return (
    <details className="group rounded-xl border border-border bg-card">
      <summary
        className={cn(
          "flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-medium transition-colors",
          variant === "create"
            ? "hover:text-primary"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Icon
          className={cn(
            "size-4 transition-transform",
            variant === "create" ? "group-open:rotate-45" : "group-open:rotate-90"
          )}
        />
        {summary}
      </summary>
      <div className={cn("border-t border-border", !flush && "p-4")}>{children}</div>
    </details>
  );
}
