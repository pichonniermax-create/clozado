import Link from "next/link";
import { BrandMark } from "@/components/app-shell/brand-mark";
import { cn } from "@/lib/utils";
import { PRODUCT_NAME } from "@/lib/brand";

/**
 * La marque affichée dans l'espace de travail : le logo téléversé de
 * l'organisation, sinon la marque par défaut du produit (« retour à
 * Clozado si absent », cahier des charges). UNE définition pour la barre
 * latérale, le panneau de navigation mobile et l'aperçu « Barre latérale »
 * des réglages : l'aperçu montre exactement ce que la coquille rend.
 */
export type WorkspaceMarkProps = {
  /** L'adresse du logo pour fond clair, ou null. */
  logo: string | null;
  /** Le nom de l'organisation — le texte alternatif du logo. */
  name: string;
};

/** La marque de l'espace gestionnaire (vue globale super admin) : le produit. */
export const PRODUCT_MARK: WorkspaceMarkProps = { logo: null, name: PRODUCT_NAME };

export function WorkspaceMark({
  logo,
  name,
  href,
  size = "sm",
  className,
}: WorkspaceMarkProps & {
  href?: string;
  size?: "sm" | "lg";
  className?: string;
}) {
  if (!logo) return <BrandMark size={size} href={href} className={className} />;
  const image = (
    // eslint-disable-next-line @next/next/no-img-element -- servie par notre route, déjà redimensionnée
    <img src={logo} alt={name} className={cn("w-auto max-w-full object-contain", size === "lg" ? "h-10" : "h-8")} />
  );
  const classes = cn("flex items-center", className);
  return href ? (
    <Link href={href} className={classes}>
      {image}
    </Link>
  ) : (
    <span className={classes}>{image}</span>
  );
}
