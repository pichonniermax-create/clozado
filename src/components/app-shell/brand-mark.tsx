import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * La marque de l'APPLICATION — le carré « C » et le mot Clozado. Une seule
 * définition pour la barre latérale, les écrans publics et l'accueil :
 * avant, le même fragment vivait en trois copies. La marque du CLIENT ne
 * passe jamais par ici : elle ne vit que sur la vitrine de partage et dans
 * les emails (décision de la refonte, étape 3).
 */
export function BrandMark({
  size = "sm",
  href,
  className,
}: {
  /** `lg` sur les écrans publics (accueil, connexion), `sm` dans la coquille. */
  size?: "sm" | "lg";
  href?: string;
  className?: string;
}) {
  const content = (
    <>
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground"
      >
        C
      </span>
      <span className={cn("font-semibold tracking-tight", size === "lg" ? "text-lg" : "text-sm")}>
        Clozado
      </span>
    </>
  );
  const classes = cn("flex items-center gap-2.5", className);
  return href ? (
    <Link href={href} className={classes}>
      {content}
    </Link>
  ) : (
    <span className={classes}>{content}</span>
  );
}
