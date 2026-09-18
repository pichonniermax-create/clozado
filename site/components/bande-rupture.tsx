import { Container } from "./layout-primitives";

/**
 * LA BANDE DE RUPTURE — pleine largeur, fond encre, une seule phrase.
 *
 * Elle existe pour le RYTHME autant que pour le fond : après trois sections
 * claires alternant texte et capture, l'œil a besoin d'un palier. Elle
 * porte donc ce qui se dit en une phrase et qu'aucune capture ne remplace.
 *
 * Le fond est l'encre du texte, et le texte le fond : le contraste est
 * celui du corps de page, simplement inversé — donc déjà vérifié.
 */
export function BandeRupture({
  titre,
  elements,
}: {
  titre: string;
  elements: readonly { titre: string; texte: string }[];
}) {
  return (
    <section className="bg-foreground py-16 text-background sm:py-20 lg:py-24">
      <Container largeur="large">
        <h2 className="max-w-4xl text-balance text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl lg:leading-[1.15]">
          {titre}
        </h2>
        <dl className="mt-12 grid gap-8 sm:grid-cols-3 sm:gap-10">
          {elements.map((element) => (
            <div key={element.titre} className="border-t border-background/25 pt-5">
              <dt className="font-semibold">{element.titre}</dt>
              {/* 80 % d'opacité sur un fond encre : le texte secondaire reste très au-dessus du seuil AA. */}
              <dd className="mt-2 text-sm leading-relaxed text-background/80">{element.texte}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}
