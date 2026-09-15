import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * Le `<select>` NATIF du socle (audit UI du 2026-09-14) : avant, onze
 * fichiers recopiaient chacun leur constante `SELECT_CLASS` — hauteurs,
 * marges et largeurs divergentes, chevron du navigateur, aucun anneau de
 * focus, et un corps de 14 px qui déclenche le zoom d'iOS. Ici, les mêmes
 * jetons que l'`Input` (h-8, rayon, bordure, anneau de focus, `text-base`
 * sous md) et le chevron du socle. Composant serveur : il vit aussi bien
 * dans un formulaire `<form action>` d'un Server Component que dans un
 * formulaire client (`value`/`onChange` passent tels quels). Le `Select`
 * Base UI (`ui/select.tsx`) reste celui des formulaires client contrôlés
 * qui ont besoin d'un menu riche. `className` s'applique à l'enveloppe :
 * c'est là que se décide la largeur (`w-auto`, `max-w-56`, `sm:w-auto`…).
 */
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <span className={cn("relative inline-flex w-full min-w-0", className)}>
      <select
        data-slot="native-select"
        className="h-8 w-full min-w-0 appearance-none rounded-lg border border-input bg-transparent py-1 pl-2.5 pr-8 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive pointer-coarse:min-h-10 md:text-sm dark:bg-input/30"
        {...props}
      />
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground" />
    </span>
  );
}
