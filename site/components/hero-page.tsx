import { cn } from "@/lib/cn";

/**
 * LE PREMIER ÉCRAN D'UNE PAGE, dans la grille éditoriale : un surtitre en
 * petites capitales filetées, le titre, le propos, et les appels à
 * l'action. Sept colonnes sur douze — jamais centré.
 *
 * `aside` reçoit ce qui accompagne le propos quand il y a quelque chose à
 * montrer ; sans lui, le texte occupe neuf colonnes plutôt que sept, pour
 * qu'aucune moitié de page ne reste vide.
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
      <div className="editorial-conteneur py-14 sm:py-20 lg:py-24">
        <div className="grid grid-cols-12 gap-x-6 gap-y-12">
          <div data-entree className={cn("col-span-12 min-w-0", aside ? "lg:col-span-7" : "lg:col-span-9")}>
            <p className="label">{surtitre}</p>
            <h1 className="mt-6 text-titre-1 text-foreground">{titre}</h1>
            <p className="mesure mt-8 text-pretty text-chapo text-muted-foreground">{chapo}</p>
            {precision && <p className="mesure mt-4 text-pretty text-chapo text-muted-foreground">{precision}</p>}
            {appels && <div className="mt-10">{appels}</div>}
            {note && <p className="mt-4 text-sm text-muted-foreground">{note}</p>}
          </div>
          {aside && (
            <div data-entree data-rang={1} className="rompt-a-droite col-span-12 min-w-0 lg:col-start-8 lg:col-span-5">
              {aside}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
