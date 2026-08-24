import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * L'« état vide » : le cadre en pointillés qui remplace une liste sans
 * contenu. Trois formes, une seule règle — un écran vide dit ce qu'il est
 * et propose le geste suivant, il ne constate pas seulement l'absence :
 *
 * - **structurée** (`title`, explication en enfant, `action`) : la forme à
 *   préférer pour un écran ou une section vides — « Aucun partenaire pour
 *   l'instant » + ce que sont les partenaires + « Ajouter un partenaire » ;
 * - **paragraphe** (enfant seul) : une phrase, pour une sous-section dont
 *   le contexte se suffit ;
 * - **ligne** (`icon` + enfant) : le constat aligné à gauche des piles du
 *   suivi (« aucun partage en souffrance » est une bonne nouvelle, pas un
 *   vide à remplir).
 */
export function EmptyState({
  icon,
  title,
  action,
  children,
  className,
}: {
  icon?: ReactNode;
  title?: string;
  /** Un ou plusieurs liens/boutons — le geste qui remplit l'écran. */
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  if (!title && !action) {
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

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-10 text-center",
        className
      )}
    >
      {icon && (
        <span
          aria-hidden
          className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5"
        >
          {icon}
        </span>
      )}
      <div className="flex flex-col gap-1">
        {title && <p className="text-sm font-medium">{title}</p>}
        {children && (
          <p className="max-w-md text-sm text-muted-foreground text-pretty">{children}</p>
        )}
      </div>
      {action && <div className="flex flex-wrap items-center justify-center gap-2 pt-1">{action}</div>}
    </div>
  );
}
