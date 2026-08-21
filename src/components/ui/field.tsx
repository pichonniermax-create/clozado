import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Le « champ de formulaire » : libellé + contrôle + aide éventuelle,
 * toujours le même espacement. Le motif existait en plus de trente
 * exemplaires recopiés à la main (cf. docs/inventaire-ui.md §3).
 */
export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor: string;
  /** Aide affichée sous le contrôle — jamais dans le placeholder. */
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
