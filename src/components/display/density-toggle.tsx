import Link from "next/link";
import { Rows2, Rows3 } from "lucide-react";
import { DENSITIES, type Density } from "@/lib/display/state";
import { cn } from "@/lib/utils";
import { getTranslations } from "next-intl/server";

/**
 * LA DENSITÉ D'UNE LISTE (lot 1, étape 5) — « confortable » (la hauteur
 * historique du produit) ou « compacte » (plus de lignes à l'écran, ce que
 * demandent ceux qui travaillent toute la journée dedans). Deux liens :
 * le choix part dans l'adresse et se mémorise pour la personne, comme le
 * reste de l'affichage.
 */
export async function DensityToggle({ hrefFor, current, className }: { hrefFor: (density: Density) => string; current: Density; className?: string }) {
  const t = await getTranslations("ui.display");
  const icons: Record<Density, typeof Rows2> = { confortable: Rows3, compacte: Rows2 };
  return (
    <div className={cn("flex items-center gap-0.5 rounded-lg border border-border p-0.5", className)} role="group" aria-label={t("densite")}>
      {DENSITIES.map((density) => {
        const Icon = icons[density];
        return (
          <Link
            key={density}
            href={hrefFor(density)}
            aria-current={current === density ? "true" : undefined}
            title={t(`densite_${density}`)}
            className={cn(
              "rounded-md p-1.5 transition-colors",
              current === density ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-4" aria-hidden />
            <span className="sr-only">{t(`densite_${density}`)}</span>
          </Link>
        );
      })}
    </div>
  );
}
