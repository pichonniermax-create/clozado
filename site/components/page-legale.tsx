import type { BlocLegal, PageLegale } from "@/content/types";
import { Container } from "./layout-primitives";
import { sansOrphelin } from "@/lib/titres";

function Bloc({ bloc }: { bloc: BlocLegal }) {
  if (bloc.type === "texte") {
    return <p className="text-pretty leading-relaxed text-muted-foreground">{bloc.texte}</p>;
  }
  if (bloc.type === "liste") {
    return (
      <ul className="flex flex-col gap-3">
        {bloc.elements.map((element) => (
          <li key={element} className="flex gap-3 leading-relaxed">
            <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
            <span className="text-muted-foreground">{element}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-[minmax(0,14rem)_1fr]">
      {bloc.elements.map((element) => (
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
 * sections numérotées par leur titre en `h2` : c'est un document, pas une
 * page de vente — aucune carte, aucun appel à l'action.
 */
export function PageLegaleRendu({ contenu }: { contenu: PageLegale }) {
  return (
    <Container className="py-16 sm:py-20">
      <div className="max-w-3xl">
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{sansOrphelin(contenu.titre)}</h1>
        <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">{contenu.chapo}</p>
        <p className="mt-2 text-sm text-muted-foreground">{contenu.miseAJour}</p>

        <div className="mt-12 flex flex-col gap-12">
          {contenu.sections.map((section) => (
            <section key={section.titre}>
              <h2 className="text-xl font-semibold tracking-tight">{sansOrphelin(section.titre)}</h2>
              <div className="mt-4 flex flex-col gap-4">
                {section.blocs.map((bloc, index) => (
                  <Bloc key={index} bloc={bloc} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </Container>
  );
}
