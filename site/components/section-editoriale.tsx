import { cn } from "@/lib/cn";
import { sansOrphelin } from "@/lib/titres";

/**
 * UNE SECTION DE LA PAGE — CENTRÉE (décision de l'éditeur, 2026-09-21).
 *
 * ELLE NE PORTE PLUS DE GRILLE NI DE DÉCALAGE. La version précédente posait
 * douze colonnes et faisait commencer le propos à la quatrième : le titre
 * tombait 294 px à droite du bord du conteneur à 1280, 334 px à 1440, et
 * rien n'était centré. Cette composition a été remplacée ; AUCUNE SESSION NE
 * DOIT Y REVENIR, et `scripts/verifier-composition.mjs` interdit désormais
 * qu'une page repose un décalage de colonne ou une largeur à elle.
 *
 * CE QUI ANNONCE EST CENTRÉ — sur-titre, titre, chapô —, dans une largeur de
 * ligne bornée : un titre ne s'étale jamais d'un bord à l'autre du
 * conteneur, sinon l'œil perd la ligne suivante.
 *
 * CE QUI SE LIT EST À GAUCHE — le contenu de la section occupe toute la
 * largeur du conteneur, et son texte reste aligné à gauche.
 *
 * Le titre reste un `h2` : la hiérarchie des titres est une exigence
 * d'accessibilité, et le numéro n'en fait pas partie (il est `aria-hidden`,
 * une synthèse vocale n'a rien à lire dans « 03 »).
 *
 * LE NUMÉRO, quand il y en a un, s'affiche AU-DESSUS du titre et centré avec
 * lui. Il ne numérote que la page Produit, seule vraie séquence du site.
 */
export function SectionEditoriale({
  numero,
  intitule,
  titre,
  chapo,
  children,
  ton = "normal",
  id,
}: {
  numero?: string;
  intitule?: string;
  titre?: string;
  chapo?: string;
  children: React.ReactNode;
  ton?: "normal" | "doux";
  id?: string;
}) {
  const aEnTete = Boolean(numero || intitule || titre || chapo);
  return (
    <section
      id={id}
      className={cn("border-t border-border py-24 sm:py-24 lg:py-36", ton === "doux" && "bg-muted")}
    >
      <div className="editorial-conteneur">
        {aEnTete && (
          <header data-entree className="entete-section">
            {numero && <p aria-hidden className="numero-section text-geant">{numero}</p>}
            {intitule && <p className="label">{intitule}</p>}
            {titre && <h2 className="mt-6 text-balance text-titre-2 text-foreground">{sansOrphelin(titre)}</h2>}
            {chapo && <p className="mesure mt-6 text-pretty text-chapo text-muted-foreground">{chapo}</p>}
          </header>
        )}
        <div data-entree data-rang={1} className={cn("corps-section", aEnTete && "mt-12")}>
          {children}
        </div>
      </div>
    </section>
  );
}
