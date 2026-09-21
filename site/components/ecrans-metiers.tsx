import { cn } from "@/lib/cn";
import { Cadre } from "./ecran-produit";

/**
 * LES TROIS ÉCRANS DE PREUVE DES PAGES MÉTIER — une forme par métier.
 *
 * Ils partagent le cadre des autres écrans (`Cadre`), et RIEN D'AUTRE : ni
 * données, ni structure. Un dossier de patrimoine se juge à son cycle de vie
 * et à ses points d'arrêt, un courtier compare des délais et des montants,
 * un agent immobilier suit des personnes qui avancent ou pas. Trois façons
 * de regarder, trois écrans.
 *
 * Comme les autres, ils sont REDESSINÉS EN HTML : aucune image, du texte
 * sélectionnable, net à toutes les densités, et lisible à 390 px — les
 * tableaux défilent dans leur cadre plutôt que de pousser la page.
 *
 * Aucun mot n'est écrit ici : tout vient de `content/<langue>/ecrans-metiers.ts`.
 */

type Etape = {
  readonly libelle: string;
  readonly date: string;
  readonly ecart: string;
  readonly etat: "fait" | "arret" | "attente";
  readonly note?: string;
};

/**
 * LA CHRONOLOGIE — gestion de patrimoine.
 *
 * Un rail vertical, une pastille par étape, et l'écart avec l'étape
 * précédente écrit en chasse fixe : c'est l'écart qui se lit, pas la date.
 * Les deux points d'arrêt sont les seules pastilles pleines — ce sont les
 * deux seules choses que l'œil doit trouver en trois secondes.
 */
export function EcranChronologie({
  ecran,
  className,
}: {
  ecran: {
    readonly nom: string;
    readonly resume: string;
    readonly legende: string;
    readonly ancienneteLibelle: string;
    readonly ancienneteValeur: string;
    readonly etapes: readonly Etape[];
  };
  className?: string;
}) {
  return (
    <Cadre nom={ecran.nom} resume={ecran.resume} legende={ecran.legende} className={className}>
      <div className="flex items-baseline justify-between gap-4 border-b border-border px-4 py-3 sm:px-6">
        <p className="ecran-mention">{ecran.ancienneteLibelle}</p>
        <p className="tabulaire text-xl font-semibold text-foreground">{ecran.ancienneteValeur}</p>
      </div>
      <ol className="px-4 py-4 sm:px-6">
        {ecran.etapes.map((etape, rang) => (
          <li key={etape.libelle} data-ligne className="relative flex gap-4 pb-6 last:pb-0">
            {/* Le rail : il relie les pastilles, sauf après la dernière. */}
            {rang < ecran.etapes.length - 1 && (
              <span aria-hidden className="absolute left-[5px] top-4 bottom-0 w-px bg-border" />
            )}
            <span
              aria-hidden
              className={cn(
                "relative mt-2 size-[11px] shrink-0 rounded-full border",
                etape.etat === "fait" && "border-border bg-card",
                etape.etat === "arret" && "border-transparent bg-primary",
                etape.etat === "attente" && "border-primary bg-card"
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-sm font-medium text-foreground">{etape.libelle}</p>
                <p className="tabulaire text-xs text-muted-foreground">
                  {etape.date}
                  {etape.ecart && <span className="ml-2 text-foreground">+{etape.ecart}</span>}
                </p>
              </div>
              {etape.note && <p className="ecran-mention mt-1 text-primary-ink">{etape.note}</p>}
            </div>
          </li>
        ))}
      </ol>
    </Cadre>
  );
}

/**
 * LE TABLEAU CHIFFRÉ — courtage.
 *
 * Deux tableaux, chacun avec sa ligne de total : les dossiers qui dorment
 * chez une banque, et ce que chaque partenaire a rapporté sans être encore
 * payé. Les totaux sont la somme des lignes, et le délai moyen est pondéré
 * par le nombre de dossiers — un écran de démonstration qui ne tient pas ses
 * additions décrédibilise le reste de la page.
 */
export function EcranTableauCourtage({
  ecran,
  className,
}: {
  ecran: {
    readonly nom: string;
    readonly resume: string;
    readonly legende: string;
    readonly banques: {
      readonly colonnes: { readonly nom: string; readonly dossiers: string; readonly moyen: string; readonly ancien: string };
      readonly lignes: readonly { readonly nom: string; readonly dossiers: string; readonly moyen: string; readonly ancien: string }[];
      readonly total: { readonly nom: string; readonly dossiers: string; readonly moyen: string; readonly ancien: string };
    };
    readonly commissions: {
      readonly titre: string;
      readonly colonnes: { readonly nom: string; readonly dossiers: string; readonly montant: string };
      readonly lignes: readonly { readonly nom: string; readonly dossiers: string; readonly montant: string }[];
      readonly total: { readonly nom: string; readonly dossiers: string; readonly montant: string };
    };
  };
  className?: string;
}) {
  return (
    <Cadre nom={ecran.nom} resume={ecran.resume} legende={ecran.legende} className={className}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[26rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="ecran-col">{ecran.banques.colonnes.nom}</th>
              <th scope="col" className="ecran-col text-right">{ecran.banques.colonnes.dossiers}</th>
              <th scope="col" className="ecran-col text-right">{ecran.banques.colonnes.moyen}</th>
              <th scope="col" className="ecran-col text-right">{ecran.banques.colonnes.ancien}</th>
            </tr>
          </thead>
          <tbody>
            {ecran.banques.lignes.map((ligne) => (
              <tr key={ligne.nom} data-ligne className="ecran-rangee">
                <th scope="row" className="ecran-cellule font-medium text-foreground">{ligne.nom}</th>
                <td className="ecran-cellule text-right text-foreground">{ligne.dossiers}</td>
                <td className="ecran-cellule text-right text-muted-foreground">{ligne.moyen}</td>
                <td className="ecran-cellule text-right text-muted-foreground">{ligne.ancien}</td>
              </tr>
            ))}
            <tr className="border-t border-border bg-muted/60">
              <th scope="row" className="ecran-cellule font-semibold text-foreground">{ecran.banques.total.nom}</th>
              <td className="ecran-cellule text-right font-semibold text-foreground">{ecran.banques.total.dossiers}</td>
              <td className="ecran-cellule text-right font-semibold text-foreground">{ecran.banques.total.moyen}</td>
              <td className="ecran-cellule text-right font-semibold text-foreground">{ecran.banques.total.ancien}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <section className="border-t border-border">
        <header className="ecran-pile-entete">
          <p className="ecran-nom">{ecran.commissions.titre}</p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[22rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="ecran-col">{ecran.commissions.colonnes.nom}</th>
                <th scope="col" className="ecran-col text-right">{ecran.commissions.colonnes.dossiers}</th>
                <th scope="col" className="ecran-col text-right">{ecran.commissions.colonnes.montant}</th>
              </tr>
            </thead>
            <tbody>
              {ecran.commissions.lignes.map((ligne) => (
                <tr key={ligne.nom} data-ligne className="ecran-rangee">
                  <th scope="row" className="ecran-cellule font-medium text-foreground">{ligne.nom}</th>
                  <td className="ecran-cellule text-right text-muted-foreground">{ligne.dossiers}</td>
                  <td className="ecran-cellule text-right text-foreground">{ligne.montant}</td>
                </tr>
              ))}
              <tr className="border-t border-border bg-muted/60">
                <th scope="row" className="ecran-cellule font-semibold text-foreground">{ecran.commissions.total.nom}</th>
                <td className="ecran-cellule text-right font-semibold text-foreground">{ecran.commissions.total.dossiers}</td>
                <td className="ecran-cellule text-right font-semibold text-foreground">{ecran.commissions.total.montant}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </Cadre>
  );
}

/**
 * LA JAUGE DE PARCOURS — transaction immobilière.
 *
 * Quatre positions sur une ligne, un point par dossier posé à sa position
 * réelle, et sous la ligne le compte de chaque position. Ce qui doit sauter
 * aux yeux en trois secondes, ce sont les points PLEINS : les dossiers qui
 * n'ont pas bougé au-delà du seuil, avec leur ancienneté en chasse fixe.
 *
 * C'était une liste à piles — la même forme que le Suivi de l'accueil. Un
 * visiteur qui passait de l'une à l'autre voyait deux fois le même écran.
 *
 * EN DESSOUS DE 640 px, la jauge bascule : la ligne devient verticale et
 * chaque position devient une rangée. Ce n'est pas une réduction, c'est une
 * rotation — les mêmes points, les mêmes comptes, lisibles au doigt.
 */
export function EcranJaugeParcours({
  ecran,
  className,
}: {
  ecran: {
    readonly nom: string;
    readonly resume: string;
    readonly legende: string;
    readonly seuilLibelle: string;
    readonly positions: readonly { readonly cle: string; readonly libelle: string; readonly compte: string }[];
    readonly dossiers: readonly {
      readonly position: string;
      readonly personne: string;
      readonly bien: string;
      readonly depuisLe: string;
      readonly anciennete: string;
      readonly marque: boolean;
    }[];
  };
  className?: string;
}) {
  const marques = ecran.dossiers.filter((dossier) => dossier.marque);
  return (
    <Cadre nom={ecran.nom} resume={ecran.resume} legende={ecran.legende} className={className}>
      <div className="jauge px-4 py-6 sm:px-6">
        {ecran.positions.map((position) => {
          const dossiers = ecran.dossiers.filter((dossier) => dossier.position === position.cle);
          return (
            <div key={position.cle} data-ligne className="jauge-poste">
              <ul className="jauge-points">
                {dossiers.map((dossier) => (
                  <li key={dossier.personne} className="jauge-point" title={`${dossier.personne} — ${dossier.bien}`}>
                    <span
                      aria-hidden
                      className={cn(
                        "size-[9px] shrink-0 rounded-full border",
                        dossier.marque ? "border-transparent bg-primary" : "border-muted-foreground/60 bg-card"
                      )}
                    />
                    {dossier.marque && <span className="tabulaire text-[11px] text-primary-ink">{dossier.anciennete}</span>}
                  </li>
                ))}
              </ul>
              <div className="jauge-rail" aria-hidden />
              <p className="jauge-libelle">{position.libelle}</p>
              <p className="jauge-compte tabulaire">{position.compte}</p>
            </div>
          );
        })}
      </div>

      <div className="border-t border-border px-4 py-3 sm:px-6">
        <p className="ecran-mention">{ecran.seuilLibelle}</p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {marques.map((dossier) => (
            <li key={dossier.personne} className="text-xs text-foreground">
              {dossier.personne} <span className="tabulaire text-primary-ink">{dossier.anciennete}</span>
            </li>
          ))}
        </ul>
      </div>
    </Cadre>
  );
}
