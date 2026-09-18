import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionLink } from "@/components/action-link";
import { Container, Section } from "@/components/layout-primitives";
import { getDictionary, isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";
import { DEMO_URL, SITE_CONFIG } from "@/lib/site-config";

export async function generateMetadata(props: PageProps<"/[locale]/tarifs">): Promise<Metadata> {
  const { locale } = await props.params;
  if (!isLocale(locale)) return {};
  const { tarifs } = getDictionary(locale);
  return pageMetadata({ locale, route: "tarifs", titre: tarifs.meta.titre, description: tarifs.meta.description });
}

/**
 * /fr/tarifs — les valeurs entre crochets viennent des contenus et
 * s'affichent telles quelles : le site ne peut pas partir en ligne sans
 * qu'on les ait vues à l'écran.
 */
export default async function Tarifs(props: PageProps<"/[locale]/tarifs">) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();
  const { common, tarifs } = getDictionary(locale);

  return (
    <>
      <Container className="py-16 sm:py-24">
        <div className="max-w-3xl">
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl lg:leading-[1.1]">
            {tarifs.hero.titre}
          </h1>
          <p className="mt-6 text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl">
            {tarifs.hero.chapo}
          </p>
        </div>

        <div className="mt-12 grid gap-6 rounded-2xl border border-border bg-card p-6 text-card-foreground sm:p-10 lg:grid-cols-[minmax(0,20rem)_1fr] lg:gap-12">
          <div>
            <h2 className="text-lg font-semibold">{tarifs.offre.nom}</h2>
            <p className="mt-6 flex flex-wrap items-baseline gap-x-2">
              <span className="text-4xl font-semibold tracking-tight tabular-nums">{tarifs.offre.prix}</span>
              <span className="text-sm text-muted-foreground">{tarifs.offre.unite}</span>
            </p>
            <p className="mt-3 text-sm text-muted-foreground">{tarifs.offre.mention}</p>
            <div className="mt-8 flex flex-col gap-3">
              <ActionLink href={SITE_CONFIG.bookingUrl} externe mentionNouvelOnglet={common.actions.nouvelOnglet}>
                {common.actions.reserverUneDemo}
              </ActionLink>
              <ActionLink
                href={DEMO_URL}
                variante="secondaire"
                externe
                mentionNouvelOnglet={common.actions.nouvelOnglet}
              >
                {common.actions.ouvrirLaDemo}
              </ActionLink>
            </div>
          </div>

          <div className="border-t border-border pt-6 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0">
            <h3 className="text-sm font-semibold">{tarifs.offre.inclus}</h3>
            <ul className="mt-4 flex flex-col gap-3">
              {tarifs.offre.elements.map((element) => (
                <li key={element} className="flex gap-3 text-sm leading-relaxed">
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
                  <span className="text-muted-foreground">{element}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm text-muted-foreground">{tarifs.offre.note}</p>
          </div>
        </div>
      </Container>

      <Section intitule={tarifs.questions.intitule} titre={tarifs.questions.titre}>
        {/* Des `<details>` natifs : accessibles au clavier d'origine, et zéro octet de JavaScript. */}
        <div className="max-w-3xl divide-y divide-border border-y border-border">
          {tarifs.questions.elements.map((element) => (
            <details key={element.question} className="group py-4">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-medium [&::-webkit-details-marker]:hidden">
                {element.question}
                <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-2xl text-pretty leading-relaxed text-muted-foreground">{element.reponse}</p>
            </details>
          ))}
        </div>
      </Section>

      <Section>
        <div className="rounded-2xl border border-border bg-card px-6 py-12 sm:px-12">
          <div className="max-w-2xl">
            <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">{tarifs.final.titre}</h2>
            <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">{tarifs.final.texte}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <ActionLink href={SITE_CONFIG.bookingUrl} externe mentionNouvelOnglet={common.actions.nouvelOnglet}>
                {common.actions.reserverUneDemo}
              </ActionLink>
              <ActionLink
                href={DEMO_URL}
                variante="secondaire"
                externe
                mentionNouvelOnglet={common.actions.nouvelOnglet}
              >
                {common.actions.ouvrirLaDemo}
              </ActionLink>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
