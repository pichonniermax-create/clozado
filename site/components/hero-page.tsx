import { classeTitre, sansOrphelin } from "@/lib/titres";

/**
 * LE PREMIER ÉCRAN D'UNE PAGE — CENTRÉ (décision de l'éditeur, 2026-09-21).
 *
 * Il tenait sur sept colonnes de douze, aligné à gauche, « jamais centré ».
 * Ce n'est plus la composition du site, et aucune session ne doit y revenir.
 *
 * DEUX CAS, ET DEUX SEULEMENT :
 *
 * — SANS ÉCRAN DE PREUVE, tout est centré : sur-titre, titre, propos, appels
 *   à l'action. C'est le cas des pages qui n'ont rien à montrer — conformité,
 *   démonstration, blog, à propos, carrières, pages légales.
 *
 * — AVEC ÉCRAN DE PREUVE, deux colonnes DE LARGEUR ÉGALE (`.duo`), le bloc
 *   entier centré puisque le conteneur l'est, et le texte aligné à gauche
 *   dans sa colonne. Égales, et pas 7/5 : deux colonnes inégales rendent le
 *   bloc désaxé, ce qu'on vient précisément de retirer.
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
  const propos = (
    <div data-entree className={aside ? undefined : "colonne-lecture-centree"}>
      <p className="label">{surtitre}</p>
      <h1 className={`mt-6 text-foreground ${classeTitre(titre)}`}>{sansOrphelin(titre)}</h1>
      <p className="mesure mt-6 text-pretty text-chapo text-muted-foreground">{chapo}</p>
      {precision && <p className="mesure mt-3 text-pretty text-chapo text-muted-foreground">{precision}</p>}
      {appels && <div className="mt-6">{appels}</div>}
      {note && <p className="mt-4 text-sm text-muted-foreground">{note}</p>}
    </div>
  );

  return (
    <section className="border-b border-border">
      <div className="editorial-conteneur py-12 sm:py-12 lg:py-12">
        {aside ? (
          <div className="duo">
            {propos}
            <div data-entree data-rang={1} className="ecran-compact">
              {aside}
            </div>
          </div>
        ) : (
          propos
        )}
      </div>
    </section>
  );
}
