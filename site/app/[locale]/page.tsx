import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionLink } from "@/components/action-link";
import { Card, Container, Section } from "@/components/layout-primitives";
import { References } from "@/components/references";
import Link from "next/link";
import { getDictionary, isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";
import { path, ROUTES } from "@/lib/routes";
import { DEMO_URL, SITE_CONFIG } from "@/lib/site-config";

export async function generateMetadata(props: PageProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await props.params;
  if (!isLocale(locale)) return {};
  const { accueil } = getDictionary(locale);
  return pageMetadata({
    locale,
    route: "accueil",
    titre: accueil.meta.titre,
    description: accueil.meta.description,
  });
}

/**
 * LA PAGE D'ACCUEIL : le constat, ce que fait le produit, pour qui, les
 * contrôles et la conformité, le périmètre, l'appel à l'action.
 *
 * Aucun texte n'est écrit ici — tout vient de `content/<langue>/accueil.ts`.
 * Aucune image non plus : la page est faite de texte et de filets, ce qui
 * lui donne un LCP purement textuel.
 */
export default async function Accueil(props: PageProps<"/[locale]">) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();
  const { common, accueil } = getDictionary(locale);

  return (
    <>
      {/* Hero */}
      <Container className="py-16 sm:py-24 lg:py-28">
        <div className="max-w-3xl">
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl lg:leading-[1.1]">
            {accueil.hero.titre}
          </h1>
          <p className="mt-6 text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl">
            {accueil.hero.chapo}
          </p>
          <p className="mt-3 text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl">
            {accueil.hero.precision}
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
            <ActionLink href={SITE_CONFIG.bookingUrl} externe mentionNouvelOnglet={common.actions.nouvelOnglet}>
              {common.actions.reserverUneDemo}
            </ActionLink>
            <ActionLink href={DEMO_URL} variante="secondaire" externe mentionNouvelOnglet={common.actions.nouvelOnglet}>
              {common.actions.ouvrirLaDemo}
            </ActionLink>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">{accueil.hero.note}</p>
        </div>
      </Container>

      {/* Le constat */}
      <Section intitule={accueil.probleme.intitule} titre={accueil.probleme.titre}>
        <ol className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
          {accueil.probleme.elements.map((element, index) => (
            <li key={element.titre} className="bg-card p-6">
              <p className="font-mono text-sm tabular-nums text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-4 font-semibold">{element.titre}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{element.texte}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* Le produit */}
      <Section intitule={accueil.produit.intitule} titre={accueil.produit.titre}>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {accueil.produit.elements.map((element) => (
            <li key={element.titre}>
              <Card className="h-full">
                <h3 className="font-semibold">{element.titre}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{element.texte}</p>
              </Card>
            </li>
          ))}
        </ul>
      </Section>

      {/* Pour qui */}
      <Section intitule={accueil.pourQui.intitule} titre={accueil.pourQui.titre} chapo={accueil.pourQui.chapo}>
        <ul className="grid gap-4 sm:grid-cols-3">
          {accueil.pourQui.elements.map((element) => {
            const corps = (
              <>
                <h3 className="font-semibold">{element.titre}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{element.texte}</p>
              </>
            );
            // La carte n'est cliquable que si sa page existe : le site n'a jamais de lien mort.
            return (
              <li key={element.cle}>
                {ROUTES[element.cle].built ? (
                  <Link
                    href={path(locale, element.cle)}
                    className="block h-full rounded-xl border border-border bg-card p-6 text-card-foreground transition-colors hover:border-primary-ink"
                  >
                    {corps}
                    <p className="mt-4 text-sm font-medium text-primary-ink">{common.actions.enSavoirPlus}</p>
                  </Link>
                ) : (
                  <Card className="h-full">{corps}</Card>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      {/* Contrôle et conformité */}
      <Section
        intitule={accueil.conformite.intitule}
        titre={accueil.conformite.titre}
        chapo={accueil.conformite.chapo}
      >
        <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {accueil.conformite.elements.map((element) => (
            <div key={element.titre}>
              <dt className="font-semibold">{element.titre}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{element.texte}</dd>
            </div>
          ))}
        </dl>
      </Section>

      {/* Le périmètre */}
      <Section intitule={accueil.perimetre.intitule} titre={accueil.perimetre.titre}>
        <ul className="flex max-w-2xl flex-col gap-3">
          {accueil.perimetre.elements.map((element) => (
            <li key={element} className="flex gap-3 text-base leading-relaxed">
              <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
              <span className="text-muted-foreground">{element}</span>
            </li>
          ))}
        </ul>
      </Section>

      <References locale={locale} />

      {/* Appel à l'action final */}
      <Section bordered>
        <div className="rounded-2xl border border-border bg-card px-6 py-12 sm:px-12">
          <div className="max-w-2xl">
            <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">{accueil.final.titre}</h2>
            <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">{accueil.final.texte}</p>
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
