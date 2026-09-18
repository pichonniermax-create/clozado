import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionLink } from "@/components/action-link";
import { BandeRupture } from "@/components/bande-rupture";
import { CaptureProduit } from "@/components/capture-produit";
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
 * Son rythme est délibéré : un premier écran qui porte le produit en image,
 * un constat en trois temps sur fond teinté, trois preuves où le texte et
 * l'écran alternent de côté, une bande sombre pleine largeur qui casse la
 * cadence, puis des sections de plus en plus étroites à mesure que le
 * propos devient dense. Les largeurs changent d'une section à l'autre —
 * c'est ce qui empêche la page de s'aplatir en une colonne unique.
 *
 * Aucune image n'est décorative : chacune est posée contre l'affirmation
 * qu'elle prouve, et son texte alternatif décrit ce qu'on y lit.
 *
 * Aucun texte n'est écrit ici : tout vient de `content/<langue>/accueil.ts`.
 */
export default async function Accueil(props: PageProps<"/[locale]">) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();
  const { common, accueil } = getDictionary(locale);

  const appels = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <ActionLink href={SITE_CONFIG.bookingUrl} externe mentionNouvelOnglet={common.actions.nouvelOnglet}>
        {common.actions.reserverUneDemo}
      </ActionLink>
      <ActionLink href={DEMO_URL} variante="secondaire" externe mentionNouvelOnglet={common.actions.nouvelOnglet}>
        {common.actions.ouvrirLaDemo}
      </ActionLink>
    </div>
  );

  return (
    <>
      {/* PREMIER ÉCRAN — deux colonnes, alignées en leur milieu : le propos à
          gauche, le produit à droite jusqu'au bord. C'est ce qui remplit la
          largeur ; une colonne unique laissait les deux tiers droits vides. */}
      <section className="overflow-hidden border-b border-border bg-muted/50">
        <Container largeur="large" className="py-14 sm:py-20 lg:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-12">
            <div className="lg:col-span-5">
              {/* Pas de `text-balance` ici : sur un titre de quatre lignes il
                  égalise les longueurs et produit un pavé en escalier. */}
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl lg:leading-[1.08]">
                {accueil.hero.titre}
              </h1>
              <p className="mt-6 text-pretty text-lg leading-relaxed text-muted-foreground">{accueil.hero.chapo}</p>
              <p className="mt-3 text-pretty text-lg leading-relaxed text-muted-foreground">
                {accueil.hero.precision}
              </p>
              <div className="mt-8">{appels}</div>
              <p className="mt-4 text-sm text-muted-foreground">{accueil.hero.note}</p>
            </div>

            {/* La capture déborde vers la droite : elle touche le bord de l'écran
                au lieu de s'arrêter sur la gouttière, ce qui donne sa profondeur
                au premier écran. */}
            <div className="lg:col-span-7 lg:-mr-10 xl:-mr-24">
              <CaptureProduit cle="suivi" alt={accueil.hero.visuelAlt} priorite />
              <p className="mt-4 text-sm text-muted-foreground lg:pr-10 xl:pr-24">{accueil.mentionCaptures}</p>
            </div>
          </div>
        </Container>
      </section>

      <Section intitule={accueil.probleme.intitule} titre={accueil.probleme.titre} bordered={false}>
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

      {/* Les trois preuves : le texte et l'écran changent de côté à chaque fois. */}
      <Section intitule={accueil.preuves.intitule} titre={accueil.preuves.titre} largeur="large" ton="doux">
        <div className="flex flex-col gap-16 lg:gap-24">
          {accueil.preuves.elements.map((preuve, index) => (
            <div key={preuve.cle} className="grid items-center gap-8 lg:grid-cols-12 lg:gap-14">
              <div className={index % 2 === 1 ? "lg:order-2 lg:col-span-5" : "lg:col-span-5"}>
                <h3 className="text-balance text-xl font-semibold tracking-tight sm:text-2xl">{preuve.titre}</h3>
                <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">{preuve.texte}</p>
                <ul className="mt-6 flex flex-col gap-3">
                  {preuve.points.map((point) => (
                    <li key={point} className="flex gap-3 text-sm leading-relaxed">
                      <Puce />
                      <span className="text-muted-foreground">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={index % 2 === 1 ? "lg:order-1 lg:col-span-7" : "lg:col-span-7"}>
                <CaptureProduit cle={preuve.cle} alt={preuve.alt} />
              </div>
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
                <h3 className="font-semibold">{element.titre}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{element.texte}</p>
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

      <Section
        intitule={accueil.conformite.intitule}
        titre={accueil.conformite.titre}
        chapo={accueil.conformite.chapo}
        largeur="lisible"
        ton="doux"
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

      <Section intitule={accueil.perimetre.intitule} titre={accueil.perimetre.titre} largeur="etroite">
        <ul className="flex flex-col gap-3">
          {accueil.perimetre.elements.map((element) => (
            <li key={element} className="flex gap-3 text-base leading-relaxed">
              <Puce />
              <span className="text-muted-foreground">{element}</span>
            </li>
          ))}
        </ul>
      </Section>

      <References locale={locale} />

      <Section>
        <div className="rounded-2xl border border-border bg-card px-6 py-12 sm:px-12">
          <div className="max-w-2xl">
            <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">{accueil.final.titre}</h2>
            <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">{accueil.final.texte}</p>
            <div className="mt-8">{appels}</div>
          </div>
        </div>
      </Section>
    </>
  );
}
