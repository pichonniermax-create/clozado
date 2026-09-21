import type { BlocLegal, PageLegale } from "@/content/types";
import datesLegales from "@/content/dates-legales.json";
import { dateLongue } from "@/lib/dates";
import { RESERVATION_EN_LIGNE } from "@/lib/site-config";
import { classeTitre, sansOrphelin } from "@/lib/titres";

function Bloc({ bloc }: { bloc: BlocLegal }) {
  if (bloc.type === "texte") {
    return <p className="text-pretty leading-relaxed text-muted-foreground">{bloc.texte}</p>;
  }
  if (bloc.type === "liste") {
    return (
      <ul className="flex flex-col gap-3">
        {bloc.elements.map((element) => (
          <li key={element} className="flex gap-3 leading-relaxed">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
            <span className="text-muted-foreground">{element}</span>
          </li>
        ))}
      </ul>
    );
  }
  // Une ligne marquée « reservation » ne paraît que quand le bouton existe.
  const elements = bloc.elements.filter((element) => element.quand !== "reservation" || RESERVATION_EN_LIGNE);
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-[minmax(0,14rem)_1fr]">
      {elements.map((element) => (
        <div key={element.terme} className="contents">
          <dt className="font-medium">{sansOrphelin(element.terme)}</dt>
          <dd className="text-pretty leading-relaxed text-muted-foreground">{element.valeur}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * LE RENDU D'UNE PAGE LÉGALE — mentions légales et confidentialité
 * partagent celui-ci, pour que leur mise en page ne diverge jamais.
 *
 * Une colonne étroite, le texte à une longueur de ligne lisible, et les
 * sections annoncées par leur titre en `h2` : c'est un document, pas une
 * page de vente — aucune carte, aucun appel à l'action.
 *
 * Elle suit le SYSTÈME ÉDITORIAL depuis le 2026-09-18 : même conteneur,
 * même rythme vertical et une seule colonne de contenu, celle des autres
 * pages. Elle vivait jusque-là sur l'ancien gabarit, avec son propre rythme
 * et sa propre largeur.
 */
/**
 * LA DATE N'EST PAS SAISIE. Elle vient de `content/dates-legales.json`, que
 * `scripts/dates-legales.mjs` écrit à partir de l'histoire du dépôt : c'est
 * la date du dernier commit qui a touché le contenu de la page. Une date
 * écrite à la main est fausse le lendemain du jour où l'on a corrigé le
 * texte sans y penser.
 */
export function PageLegaleRendu({ contenu, page }: { contenu: PageLegale; page: keyof typeof datesLegales }) {
  const date = datesLegales[page];
  return (
    <div className="editorial">
      <section className="border-b border-border">
        <div className="editorial-conteneur py-12 sm:py-12 lg:py-12">
          <div className="grid grid-cols-12 gap-x-6">
            <div className="col-span-12 lg:col-start-4 lg:col-span-8">
              <h1 className={`${classeTitre(contenu.titre)} text-foreground`}>{sansOrphelin(contenu.titre)}</h1>
              <p className="mesure mt-6 text-pretty text-chapo text-muted-foreground">{contenu.chapo}</p>
              <p className="mt-3 text-sm text-muted-foreground">
                {contenu.miseAJour} : <time dateTime={date}>{dateLongue(date)}</time>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 sm:py-24 lg:py-36">
        <div className="editorial-conteneur">
          <div className="grid grid-cols-12 gap-x-6">
            <div className="col-span-12 flex flex-col gap-12 lg:col-start-4 lg:col-span-8">
              {contenu.sections.map((section) => (
                <section key={section.titre}>
                  <h2 className="text-titre-3 text-foreground">{sansOrphelin(section.titre)}</h2>
                  <div className="mt-6 flex flex-col gap-4">
                    {section.blocs.map((bloc, index) => (
                      <Bloc key={index} bloc={bloc} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
