import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionLink } from "@/components/action-link";
import { BandeRupture } from "@/components/bande-rupture";
import { EcranFunnel, EcranRegles, EcranSuivi, EcranTableauDeBord } from "@/components/ecran-produit";
import { Card, Container, Puce, Section } from "@/components/layout-primitives";
import { References } from "@/components/references";
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
 * LA PAGE D'ACCUEIL.
 *
 * AUCUNE IMAGE N'EST AFFICHÉE ICI, ni sur aucune page du site : pas de
 * photo, pas d'illustration, pas de capture, pas de pictogramme décoratif.
 * Quand une section doit montrer le produit, elle en REDESSINE l'écran en
 * HTML (`components/ecran-produit.tsx`) — c'est du texte, donc c'est net à
 * toutes les densités, sélectionnable, lu par une synthèse vocale, indexé,
 * et cela ne coûte aucun octet de téléchargement. Les images de partage
 * (OpenGraph) restent : elles ne s'affichent jamais dans la page.
 *
 * Son rythme : un premier écran qui pose le propos à côté du produit, un
 * constat en trois temps, trois preuves où le texte et l'écran alternent de
 * côté, une rupture pleine largeur sur fond blanc, puis des sections de plus
 * en plus étroites à mesure que le propos devient dense.
 *
 * Aucun texte n'est écrit ici : tout vient de `content/<langue>/accueil.ts`.
 */
export default async function Accueil(props: PageProps<"/[locale]">) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();
  const { common, accueil } = getDictionary(locale);

  const appels = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <ActionLink href={SITE_CONFIG.bookingUrl} externe mentionNouvelOnglet={common.actions.nouvelOnglet}>
        {common.actions.reserverUneDemo}
      </ActionLink>
      <ActionLink href={DEMO_URL} variante="secondaire" externe mentionNouvelOnglet={common.actions.nouvelOnglet}>
        {common.actions.ouvrirLaDemo}
      </ActionLink>
    </div>
  );

  /** L'écran qui prouve une affirmation. Chaque preuve porte la clé du sien. */
  const ecranDe = (cle: (typeof accueil.preuves.elements)[number]["cle"]) => {
    switch (cle) {
      case "tableau-de-bord":
        return <EcranTableauDeBord ecran={accueil.ecrans.tableauDeBord} />;
      case "regles":
        return <EcranRegles ecran={accueil.ecrans.regles} />;
      case "funnel":
        return <EcranFunnel ecran={accueil.ecrans.funnel} />;
    }
  };

  return (
    <>
      {/* PREMIER ÉCRAN — le propos à gauche, l'écran du produit à droite.
          Les deux colonnes s'alignent en haut : le titre est très grand, et
          un alignement au milieu le ferait flotter au-dessus du vide. */}
      <section className="border-b border-border">
        <Container largeur="large" className="py-16 sm:py-24 lg:py-28">
          <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="min-w-0 lg:col-span-6">
              {/* Pas de `text-balance` sur un titre de quatre lignes : il égalise
                  les longueurs et produit un pavé en escalier. */}
              <h1 className="text-titre-1 text-foreground">{accueil.hero.titre}</h1>
              <p className="mt-8 text-pretty text-chapo text-muted-foreground">{accueil.hero.chapo}</p>
              <p className="mt-4 text-pretty text-chapo text-muted-foreground">{accueil.hero.precision}</p>
              <div className="mt-10">{appels}</div>
              <p className="mt-4 text-sm text-muted-foreground">{accueil.hero.note}</p>
            </div>

            <div className="min-w-0 lg:col-span-6">
              <EcranSuivi ecran={accueil.ecrans.suivi} sansLegende />
              <p className="mt-4 text-sm text-muted-foreground">{accueil.mentionEcrans}</p>
            </div>
          </div>
        </Container>
      </section>

      <Section intitule={accueil.probleme.intitule} titre={accueil.probleme.titre} bordered={false}>
        <ul className="grid gap-4 sm:grid-cols-3">
          {accueil.probleme.elements.map((element) => (
            <li key={element.titre}>
              <Card className="h-full">
                <h3 className="text-xl font-bold tracking-tight text-foreground">{element.titre}</h3>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{element.texte}</p>
              </Card>
            </li>
          ))}
        </ul>
      </Section>

      {/* Les trois preuves : le texte et l'écran changent de côté à chaque fois. */}
      <Section intitule={accueil.preuves.intitule} titre={accueil.preuves.titre} largeur="large" ton="doux">
        <div className="flex flex-col gap-20 lg:gap-28">
          {accueil.preuves.elements.map((preuve, index) => (
            <div key={preuve.cle} className="grid items-center gap-8 lg:grid-cols-12 lg:gap-16">
              <div className={index % 2 === 1 ? "min-w-0 lg:order-2 lg:col-span-5" : "min-w-0 lg:col-span-5"}>
                <h3 className="text-balance text-titre-3 text-foreground">{preuve.titre}</h3>
                <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">{preuve.texte}</p>
                <ul className="mt-8 flex flex-col gap-4">
                  {preuve.points.map((point) => (
                    <li key={point} className="flex gap-4 text-sm leading-relaxed">
                      <Puce />
                      <span className="text-muted-foreground">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={index % 2 === 1 ? "min-w-0 lg:order-1 lg:col-span-7" : "min-w-0 lg:col-span-7"}>{ecranDe(preuve.cle)}</div>
            </div>
          ))}
        </div>
      </Section>

      <BandeRupture titre={accueil.rupture.titre} elements={accueil.rupture.elements} />

      <Section intitule={accueil.reste.intitule} titre={accueil.reste.titre} bordered={false}>
        <ul className="grid gap-4 sm:grid-cols-3">
          {accueil.reste.elements.map((element) => (
            <li key={element.titre}>
              <Card className="h-full">
                <h3 className="text-xl font-bold tracking-tight text-foreground">{element.titre}</h3>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{element.texte}</p>
              </Card>
            </li>
          ))}
        </ul>
      </Section>

      <Section intitule={accueil.pourQui.intitule} titre={accueil.pourQui.titre} chapo={accueil.pourQui.chapo}>
        <ul className="grid gap-4 sm:grid-cols-3">
          {accueil.pourQui.elements.map((element) => {
            const corps = (
              <>
                <h3 className="text-xl font-bold tracking-tight text-foreground">{element.titre}</h3>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{element.texte}</p>
              </>
            );
            // La carte n'est cliquable que si sa page existe : le site n'a jamais de lien mort.
            return (
              <li key={element.cle}>
                {ROUTES[element.cle].built ? (
                  <Link
                    href={path(locale, element.cle)}
                    className="block h-full rounded-xl border border-border bg-card p-6 text-card-foreground transition-colors hover:border-primary"
                  >
                    {corps}
                    <p className="mt-6 text-sm font-medium text-primary-ink underline underline-offset-4">
                      {common.actions.enSavoirPlus}
                    </p>
                  </Link>
                ) : (
                  <Card className="h-full">{corps}</Card>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section
        intitule={accueil.conformite.intitule}
        titre={accueil.conformite.titre}
        chapo={accueil.conformite.chapo}
        largeur="lisible"
        ton="doux"
      >
        <dl className="grid gap-x-12 gap-y-10 sm:grid-cols-2">
          {accueil.conformite.elements.map((element) => (
            <div key={element.titre}>
              <dt className="font-semibold text-foreground">{element.titre}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{element.texte}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section intitule={accueil.perimetre.intitule} titre={accueil.perimetre.titre} largeur="etroite">
        <ul className="flex flex-col gap-4">
          {accueil.perimetre.elements.map((element) => (
            <li key={element} className="flex gap-4 text-base leading-relaxed">
              <Puce />
              <span className="text-muted-foreground">{element}</span>
            </li>
          ))}
        </ul>
      </Section>

      <References locale={locale} />

      <Section>
        <div className="rounded-xl border border-border bg-card px-6 py-16 sm:px-12">
          <div className="max-w-3xl">
            <h2 className="text-balance text-titre-2 text-foreground">{accueil.final.titre}</h2>
            <p className="mt-6 text-pretty text-chapo text-muted-foreground">{accueil.final.texte}</p>
            <div className="mt-10">{appels}</div>
          </div>
        </div>
      </Section>
    </>
  );
}
