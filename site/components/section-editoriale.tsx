import { cn } from "@/lib/cn";
import { sansOrphelin } from "@/lib/titres";

/**
 * UNE SECTION DE LA PAGE COMPOSÉE.
 *
 * Elle porte deux choses que la version centrée n'avait pas : un FILET
 * pleine largeur qui sépare les sections au lieu d'un simple blanc, et une
 * GRILLE DE DOUZE COLONNES où le contenu est désaxé — le propos à partir de
 * la quatrième colonne, jamais centré.
 *
 * ET UN NUMÉRO, MAIS SUR LA SEULE PAGE QUI COMPTE VRAIMENT (2026-09-21).
 * Le numéro géant s'affichait sur six pages, où il ne numérotait rien : les
 * sections d'une page d'accueil ne sont pas une suite, elles sont un
 * sommaire. Seul le PARCOURS de la page Produit est une séquence — six
 * étapes qu'on suit dans l'ordre —, et un numéro y dit quelque chose.
 * Ailleurs il coûtait une rangée d'environ 148 px, et jusqu'à 230 px de
 * vide quand une section n'avait qu'un intitulé : le numéro occupait sa
 * ligne, et le contenu tombait sous elle.
 *
 * Le titre reste un `h2` : la hiérarchie des titres est une exigence
 * d'accessibilité, et le numéro n'en fait pas partie (il est `aria-hidden`,
 * une synthèse vocale n'a rien à lire dans « 03 »).
 */
export function SectionEditoriale({
  numero,
  intitule,
  titre,
  chapo,
  children,
  ton = "normal",
  largeurContenu = "lg:col-start-4 lg:col-span-9",
  id,
}: {
  numero?: string;
  intitule?: string;
  titre?: string;
  chapo?: string;
  children: React.ReactNode;
  ton?: "normal" | "doux";
  /** Où le contenu tombe dans la grille. C'est là que se joue le désaxement. */
  largeurContenu?: string;
  id?: string;
}) {
  const aEnTete = Boolean(intitule || titre || chapo);
  return (
    <section
      id={id}
      className={cn("border-t border-border py-24 sm:py-24 lg:py-36", ton === "doux" && "bg-muted")}
    >
      <div className="editorial-conteneur">
        <div className="grid grid-cols-12 gap-x-6 gap-y-12">
          {numero && (
            <p aria-hidden data-entree className="numero-section col-span-12 text-geant lg:col-span-3">
              {numero}
            </p>
          )}
          {aEnTete && (
            <header
              data-entree
              data-rang={1}
              className={cn("col-span-12", numero ? "lg:col-start-4 lg:col-span-8" : largeurContenu)}
            >
              {intitule && <p className="label">{intitule}</p>}
              {titre && <h2 className="mt-6 text-balance text-titre-2 text-foreground">{sansOrphelin(titre)}</h2>}
              {chapo && <p className="mesure mt-6 text-pretty text-chapo text-muted-foreground">{chapo}</p>}
            </header>
          )}
          <div className={cn("col-span-12", largeurContenu, aEnTete && "mt-6 lg:mt-12")}>{children}</div>
        </div>
      </div>
    </section>
  );
}
