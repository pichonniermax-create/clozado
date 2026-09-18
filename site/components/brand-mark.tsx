import Link from "next/link";
import { cn } from "@/lib/cn";
import { common } from "@/content/fr/common";

/**
 * La marque du produit — le carré « C » et le mot Clozado, repris à
 * l'identique de l'application (`src/components/app-shell/brand-mark.tsx`)
 * pour que le site et le produit se ressemblent au pixel. Dessinée en CSS :
 * aucune image à charger, aucun décalage de mise en page.
 *
 * Le nom de la marque ne se traduit pas — il est lu directement dans les
 * contenus français, quelle que soit la langue de la page.
 */
export function BrandMark({ href, size = "sm", prefetch }: { href?: string; size?: "sm" | "lg"; prefetch?: false }) {
  const content = (
    <>
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground"
      >
        {common.marque.charAt(0)}
      </span>
      <span className={cn("font-semibold tracking-tight", size === "lg" ? "text-lg" : "text-sm")}>
        {common.marque}
      </span>
    </>
  );
  const classes = "flex items-center gap-2.5 text-foreground";
  return href ? (
    <Link href={href} prefetch={prefetch} className={classes}>
      {content}
    </Link>
  ) : (
    <span className={classes}>{content}</span>
  );
}
