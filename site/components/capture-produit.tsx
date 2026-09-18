import { cn } from "@/lib/cn";
import { CAPTURES, type CleCapture } from "./captures";

/**
 * UNE CAPTURE DU PRODUIT, encadrée. Jamais décorative : chacune est posée à
 * côté de l'affirmation qu'elle prouve, et son texte alternatif décrit ce
 * qu'on y lit — pas « capture d'écran de Clozado ».
 *
 * `sizes` dit au navigateur la place que l'image occupera AVANT de connaître
 * la mise en page : pleine largeur sous 1024 px, un peu plus de la moitié
 * au-delà. Sans lui, il suppose 100vw et télécharge trop grand.
 *
 * Les dimensions sont écrites dans le HTML, prises de l'image la plus
 * grande : la place est réservée avant le chargement, donc aucun décalage
 * (CLS mesuré à 0). Tout est différé sauf la capture du premier écran, qui
 * est au contraire priorisée — c'est elle que le navigateur doit peindre.
 */
export function CaptureProduit({
  cle,
  alt,
  priorite = false,
  sizes = "(min-width: 1024px) 58vw, 100vw",
  className,
}: {
  cle: CleCapture;
  alt: string;
  priorite?: boolean;
  sizes?: string;
  className?: string;
}) {
  const { variantes } = CAPTURES[cle];
  const plusGrande = variantes[variantes.length - 1];
  const jeuDeSources = variantes.map((v) => `${v.src} ${v.width}w`).join(", ");
  return (
    <>
      {/* La capture du premier écran est PRÉCHARGÉE : sans cela, le navigateur
          ne la découvre qu'en analysant le corps du document, après la feuille
          de style. React hisse ce `<link>` dans l'en-tête. */}
      {priorite && (
        <link
          rel="preload"
          as="image"
          href={plusGrande.src}
          imageSrcSet={jeuDeSources}
          imageSizes={sizes}
          fetchPriority="high"
        />
      )}
      <img
        src={plusGrande.src}
        srcSet={jeuDeSources}
        sizes={sizes}
        width={plusGrande.width}
        height={plusGrande.height}
        alt={alt}
        loading={priorite ? "eager" : "lazy"}
        fetchPriority={priorite ? "high" : "auto"}
        decoding={priorite ? "sync" : "async"}
        className={cn("h-auto w-full rounded-xl border border-border bg-card shadow-sm", className)}
      />
    </>
  );
}
