import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

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
  // L'aide est RELIÉE au contrôle (audit UI du 2026-09-14) : un lecteur d'écran lit « Sans lui, le nom de
  // l'organisation. » avec le champ, pas comme un paragraphe perdu. Quand l'enfant est un seul élément, il reçoit
  // `aria-describedby` ; un enfant composé peut viser `${htmlFor}-hint` lui-même.
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const control =
    hintId && isValidElement(children)
      ? cloneElement(children as ReactElement<{ "aria-describedby"?: string }>, {
          "aria-describedby": [(children.props as { "aria-describedby"?: string })["aria-describedby"], hintId].filter(Boolean).join(" "),
        })
      : children;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {control}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}
