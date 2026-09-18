import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionLink } from "@/components/action-link";
import { Container, Section } from "@/components/layout-primitives";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";
import { DEMO_URL, SITE_CONFIG } from "@/lib/site-config";
import { sansOrphelin } from "@/lib/titres";

export async function generateMetadata(props: PageProps<"/[locale]/demo">): Promise<Metadata> {
  const { locale } = await props.params;
  if (!isLocale(locale)) return {};
  const { demo } = getDictionary(locale);
  return pageMetadata({ locale, route: "demo", titre: demo.meta.titre, description: demo.meta.description });
}

/** Une des deux cartes. Elles sont strictement symétriques : même hauteur, même structure, même poids visuel — aucun des deux gestes n'est présenté comme le bon. */
function Geste({
  surtitre,
  titre,
  texte,
  elementsTitre,
  elements,
  action,
  href,
  variante,
  locale,
}: {
  surtitre: string;
  titre: string;
  texte: string;
  elementsTitre: string;
  elements: readonly string[];
  action: string;
  href: string;
  variante: "primaire" | "secondaire";
  locale: Locale;
}) {
  const { common } = getDictionary(locale);
  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-6 text-card-foreground sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{surtitre}</p>
      <h2 className="mt-3 text-balance text-2xl font-semibold tracking-tight">{sansOrphelin(titre)}</h2>
      <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">{texte}</p>

      <h3 className="mt-8 text-sm font-semibold">{sansOrphelin(elementsTitre)}</h3>
      <ul className="mt-3 flex flex-1 flex-col gap-3">
        {elements.map((element) => (
          <li key={element} className="flex gap-3 text-sm leading-relaxed">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
            <span className="text-muted-foreground">{element}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        <ActionLink href={href} variante={variante} externe mentionNouvelOnglet={common.actions.nouvelOnglet}>
          {action}
        </ActionLink>
      </div>
    </div>
  );
}

/**
 * /fr/demo — DEUX GESTES SÉPARÉS, et rien entre eux : deux cartes de même
 * poids, côte à côte sur grand écran, l'une au-dessus de l'autre sur
 * mobile. Chacune dit ce qu'elle donne, ce qu'on y verra, et porte son
 * propre bouton. Aucun appel à l'action commun ne vient les brouiller.
 */
export default async function Demo(props: PageProps<"/[locale]/demo">) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();
  const { demo } = getDictionary(locale);

  return (
    <>
      <Container className="py-16 sm:py-20">
        <div className="max-w-3xl">
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl lg:leading-[1.1]">{sansOrphelin(demo.hero.titre)}</h1>
          <p className="mt-6 text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl">
            {demo.hero.chapo}
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <Geste
            locale={locale}
            surtitre={demo.ouvrir.surtitre}
            titre={demo.ouvrir.titre}
            texte={demo.ouvrir.texte}
            elementsTitre={demo.ouvrir.elementsTitre}
            elements={demo.ouvrir.elements}
            action={demo.ouvrir.action}
            href={DEMO_URL}
            variante="primaire"
          />
          <Geste
            locale={locale}
            surtitre={demo.reserver.surtitre}
            titre={demo.reserver.titre}
            texte={demo.reserver.texte}
            elementsTitre={demo.reserver.elementsTitre}
            elements={demo.reserver.elements}
            action={demo.reserver.action}
            href={SITE_CONFIG.bookingUrl}
            variante="primaire"
          />
        </div>
      </Container>

      <Section intitule={demo.limites.intitule} titre={demo.limites.titre}>
        <ul className="flex max-w-2xl flex-col gap-3">
          {demo.limites.elements.map((element) => (
            <li key={element} className="flex gap-3 text-base leading-relaxed">
              <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
              <span className="text-muted-foreground">{element}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section>
        <div className="max-w-2xl">
          <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">{sansOrphelin(demo.final.titre)}</h2>
          <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">{demo.final.texte}</p>
        </div>
      </Section>
    </>
  );
}
