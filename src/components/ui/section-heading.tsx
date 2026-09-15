import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * LE TITRE DE SECTION (audit UI du 2026-09-14) : avant, le compte
 * s'écrivait de quatre façons (« 44 contacts », « En retard (14) », un
 * badge, un texte gris) et le lien de fin de section de trois. Une seule
 * forme désormais : un h2 en corps de texte, le compte dans une pastille
 * neutre à sa droite, l'action ou le lien « voir tout » à l'autre bout de
 * la ligne, la description en dessous. Les clés de messages « X (n) »
 * deviennent « X » + `count`.
 */
export function SectionHeading({
  icon,
  title,
  count,
  description,
  trailing,
  id,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  /** Le nombre d'éléments de la section — omis quand il n'a pas de sens. */
  count?: number;
  description?: ReactNode;
  /** Un lien « voir tout » (`buttonVariants({ variant: "ghost", size: "sm" })`) ou une action de section. */
  trailing?: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 id={id} className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          {icon && (
            <span aria-hidden className="shrink-0 text-muted-foreground [&_svg]:size-4">
              {icon}
            </span>
          )}
          <span className="min-w-0">{title}</span>
          {count !== undefined && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground tabular-nums">{count}</span>
          )}
        </h2>
        {trailing && <div className="flex shrink-0 items-center gap-2">{trailing}</div>}
      </div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}
