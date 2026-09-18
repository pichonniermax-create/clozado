import { cn } from "@/lib/cn";
import { sansOrphelin } from "@/lib/titres";

/**
 * UNE SECTION DE LA PAGE COMPOSÉE.
 *
 * Elle porte trois choses que la version centrée n'avait pas : un NUMÉRO en
 * chasse fixe, très grand, qui donne à la page sa table des matières
 * implicite ; un FILET pleine largeur qui sépare les sections au lieu d'un
 * simple blanc ; et une GRILLE DE DOUZE COLONNES où le contenu est désaxé —
 * le numéro à gauche, le propos à partir de la quatrième colonne, jamais
 * centré.
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
      className={cn("border-t border-border py-20 sm:py-28 lg:py-36", ton === "doux" && "bg-muted")}
    >
      <div className="editorial-conteneur">
        <div className="grid grid-cols-12 gap-x-6 gap-y-10">
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
          <div className={cn("col-span-12", largeurContenu, aEnTete && "mt-6 lg:mt-10")}>{children}</div>
        </div>
      </div>
    </section>
  );
}
