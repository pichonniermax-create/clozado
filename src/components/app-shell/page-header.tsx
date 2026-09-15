import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

/**
 * En-tête unique de tous les écrans internes. Avant, chaque page composait
 * le sien (marges, tailles de titre et largeurs de colonne différentes d'un
 * écran à l'autre) : c'est ce qui donnait l'impression de six petits outils
 * séparés plutôt que d'un produit.
 *
 * `backTo` ne sert plus à naviguer — la barre latérale s'en charge — mais
 * uniquement à remonter d'une fiche vers sa liste (`/affaires/<id>` →
 * `/affaires`), là où il y a vraiment une relation de parenté.
 */
export function PageHeader({
  title,
  description,
  backTo,
  actions,
  tour,
}: {
  title: string;
  description?: ReactNode;
  backTo?: { href: string; label: string };
  actions?: ReactNode;
  /** L'attribut `data-tour` : la visite guidée éclaire cet en-tête (src/lib/tour/steps.ts). */
  tour?: string;
}) {
  return (
    <header data-tour={tour} className="flex flex-col gap-3 border-b border-border pb-5">
      {backTo && (
        <Link
          href={backTo.href}
          className="-ml-1 inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          {backTo.label}
        </Link>
      )}
      {/*
        Sous md, les actions passent SOUS le titre (elles débordaient de 150 px sur une fiche cible à 390 px) ;
        dès md, elles restent TOUJOURS à droite du titre — avant, une description longue prenait toute la ligne
        et renvoyait le bouton principal sous le texte sur la moitié des écrans (audit UI du 2026-09-14).
      */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight text-balance">{title}</h1>
          {description && (
            <div className="max-w-prose text-sm text-muted-foreground text-pretty">{description}</div>
          )}
        </div>
        {actions && <div className="flex min-w-0 flex-wrap items-center gap-2 md:shrink-0 md:justify-end">{actions}</div>}
      </div>
    </header>
  );
}
