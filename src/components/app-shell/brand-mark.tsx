import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * La marque du PRODUIT — le carré « C » et le mot Clozado. Une seule
 * définition pour les écrans publics (accueil, connexion, inscription),
 * l'espace gestionnaire (vue globale super admin) et l'espace de travail
 * d'une organisation SANS logo (`WorkspaceMark` — « retour à Clozado si
 * absent », cahier des charges). Depuis le chantier marque blanche
 * (étape 3), une organisation qui a un logo ne voit plus cette marque dans
 * son espace. Le carré est peint avec `bg-product`, hors des jetons
 * dérivés : la marque Clozado reste dans le bleu du produit sous n'importe
 * quelle couleur d'organisation.
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
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-product text-xs font-bold text-product-foreground"
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
