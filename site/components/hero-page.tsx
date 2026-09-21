import { cn } from "@/lib/cn";
import { classeTitre, sansOrphelin } from "@/lib/titres";

/**
 * LE PREMIER ÉCRAN D'UNE PAGE, dans la grille éditoriale : un surtitre en
 * petites capitales filetées, le titre, le propos, et les appels à
 * l'action. Sept colonnes sur douze — jamais centré.
 *
 * `aside` reçoit ce qui accompagne le propos quand il y a quelque chose à
 * montrer ; sans lui, le texte occupe neuf colonnes plutôt que sept, pour
 * qu'aucune moitié de page ne reste vide.
 *
 * TOUT DOIT TENIR SANS DÉFILER en 1440 × 900, 1280 × 800 et 1512 × 860 :
 * sur-titre, titre, propos, deux boutons et écran de preuve. C'est une
 * contrainte de HAUTEUR, jamais de contenu — le titre change de palier selon
 * sa longueur (`lib/titres.ts`), les espacements se resserrent, et l'écran
 * de preuve passe en densité réduite. Aucun mot n'est retiré.
 */
export function HeroPage({
  surtitre,
  titre,
  chapo,
  precision,
  appels,
  note,
  aside,
}: {
  surtitre: string;
  titre: string;
  chapo: string;
  precision?: string;
  appels?: React.ReactNode;
  note?: string;
  aside?: React.ReactNode;
}) {
  return (
    <section className="border-b border-border">
      <div className="editorial-conteneur py-12 sm:py-12 lg:py-12">
        <div className="grid grid-cols-12 gap-x-6 gap-y-12">
          <div data-entree className={cn("col-span-12 min-w-0", aside ? "lg:col-span-7" : "lg:col-span-9")}>
            <p className="label">{surtitre}</p>
            <h1 className={cn("mt-6 text-foreground", classeTitre(titre))}>{sansOrphelin(titre)}</h1>
            <p className="mesure mt-6 text-pretty text-chapo text-muted-foreground">{chapo}</p>
            {precision && <p className="mesure mt-3 text-pretty text-chapo text-muted-foreground">{precision}</p>}
            {appels && <div className="mt-6">{appels}</div>}
            {note && <p className="mt-4 text-sm text-muted-foreground">{note}</p>}
          </div>
          {aside && (
            <div data-entree data-rang={1} className="ecran-compact col-span-12 min-w-0 lg:col-start-8 lg:col-span-5">
              {aside}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
