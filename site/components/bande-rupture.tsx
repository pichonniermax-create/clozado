import { Container } from "./layout-primitives";

/**
 * LA RUPTURE DE RYTHME — pleine largeur, une seule phrase, très grande.
 *
 * Elle existe pour le RYTHME autant que pour le fond : après une longue
 * section teintée, l'œil a besoin d'un palier. Elle porte donc ce qui se
 * dit en une phrase et qu'aucun écran ne remplace.
 *
 * Elle était une bande SOMBRE. Le site ne l'est plus : la rupture se fait
 * maintenant par le blanc pur, l'échelle du texte et un souligné bordeaux —
 * le seul endroit de la page où l'accent n'est ni un bouton ni un lien,
 * parce qu'un souligné en est un usage prévu.
 */
export function BandeRupture({
  titre,
  elements,
}: {
  titre: string;
  elements: readonly { titre: string; texte: string }[];
}) {
  return (
    <section className="border-y border-border bg-card py-20 sm:py-24 lg:py-32">
      <Container largeur="large">
        <h2 data-entree className="max-w-5xl text-balance text-titre-2 text-foreground">{titre}</h2>
        <div aria-hidden data-entree data-rang={1} className="mt-8 h-1 w-16 rounded-full bg-primary" />
        <dl className="mt-12 grid gap-8 sm:grid-cols-3 sm:gap-12">
          {elements.map((element, rang) => (
            <div key={element.titre} data-entree data-rang={rang + 2} className="border-t border-border pt-6">
              <dt className="font-semibold text-foreground">{element.titre}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{element.texte}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}
