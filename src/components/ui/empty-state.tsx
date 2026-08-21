import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * L'« état vide » : le cadre en pointillés qui remplace une liste sans
 * contenu. Recopié sept fois avant d'être un composant
 * (cf. docs/inventaire-ui.md §4). Deux formes : paragraphe centré par
 * défaut, ligne alignée à gauche quand une icône l'accompagne (les piles
 * du suivi). L'étape « états vides » du chantier l'enrichira — titre,
 * explication, action — sans retoucher les écrans un à un.
 */
export function EmptyState({
  icon,
  children,
  className,
}: {
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "rounded-xl border border-dashed border-border px-4 text-sm text-muted-foreground",
        icon ? "flex items-center gap-2 py-5" : "py-10 text-center",
        className
      )}
    >
      {icon}
      {children}
    </p>
  );
}
