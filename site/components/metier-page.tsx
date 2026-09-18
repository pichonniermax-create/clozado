import { ActionLink } from "@/components/action-link";
import { Card, Container, Section } from "@/components/layout-primitives";
import type { ContenuMetier, Element } from "@/content/types";
import { getDictionary, type Locale } from "@/lib/i18n";
import { DEMO_URL, SITE_CONFIG } from "@/lib/site-config";

/** Le numéro d'un irritant et de sa réponse : « 01 », « 02 »… — c'est lui qui rend le couplage lisible. */
function Numero({ index }: { index: number }) {
  return (
    <p className="font-mono text-sm tabular-nums text-muted-foreground">{String(index + 1).padStart(2, "0")}</p>
  );
}

/** Une pastille : un sujet de veille, un indicateur. Bordée, jamais colorée — ce n'est pas un état. */
function Pastille({ children }: { children: React.ReactNode }) {
  return (
    <li className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground">{children}</li>
  );
}

function ListeNumerotee({ elements }: { elements: readonly Element[] }) {
  return (
    <ol className="grid gap-4 sm:grid-cols-2">
      {elements.map((element, index) => (
        <li key={element.titre}>
          <Card className="h-full">
            <Numero index={index} />
            <h3 className="mt-4 font-semibold">{element.titre}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{element.texte}</p>
          </Card>
        </li>
      ))}
    </ol>
  );
}

/**
 * LE GABARIT DES TROIS PAGES MÉTIER. Elles ont la même charpente — ce qui
 * coince, ce que le produit y répond dans le MÊME ORDRE (d'où les numéros),
 * les indicateurs, à qui l'on écrit et avec quoi, la conformité, le
 * périmètre — et ne diffèrent que par leur contenu.
 *
 * Aucun texte ici : tout vient de `content/<langue>/<métier>.ts`, dont la
 * forme est vérifiée à la compilation (`ContenuMetier`).
 */
export function PageMetier({ locale, contenu }: { locale: Locale; contenu: ContenuMetier }) {
  const { common } = getDictionary(locale);

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
      <Container className="py-16 sm:py-24">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {contenu.hero.secteur}
          </p>
          <h1 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl lg:leading-[1.1]">
            {contenu.hero.titre}
          </h1>
          <p className="mt-6 text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl">
            {contenu.hero.chapo}
          </p>
          <p className="mt-3 text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl">
            {contenu.hero.precision}
          </p>
          <div className="mt-10">{appels}</div>
        </div>
      </Container>

      <Section intitule={contenu.coince.intitule} titre={contenu.coince.titre}>
        <ListeNumerotee elements={contenu.coince.elements} />
      </Section>

      <Section intitule={contenu.reponse.intitule} titre={contenu.reponse.titre} chapo={contenu.reponse.chapo}>
        <ListeNumerotee elements={contenu.reponse.elements} />
      </Section>

      <Section
        intitule={contenu.indicateurs.intitule}
        titre={contenu.indicateurs.titre}
        chapo={contenu.indicateurs.chapo}
      >
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {contenu.indicateurs.elements.map((element) => (
            <Pastille key={element}>{element}</Pastille>
          ))}
        </ul>
        <p className="mt-6 max-w-2xl text-sm leading-relaxed text-muted-foreground">{contenu.indicateurs.note}</p>
      </Section>

      <Section
        intitule={contenu.communication.intitule}
        titre={contenu.communication.titre}
        chapo={contenu.communication.chapo}
      >
        <div className="flex flex-col gap-12">
          <div>
            <h3 className="text-sm font-semibold">{contenu.communication.ciblesTitre}</h3>
            <dl className="mt-4 grid gap-x-10 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              {contenu.communication.cibles.map((cible) => (
                <div key={cible.titre}>
                  <dt className="text-sm font-medium">{cible.titre}</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{cible.texte}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div>
            <h3 className="text-sm font-semibold">{contenu.communication.veilleTitre}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {contenu.communication.veilleTexte}
            </p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {contenu.communication.sujets.map((sujet) => (
                <Pastille key={sujet}>{sujet}</Pastille>
              ))}
            </ul>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {contenu.communication.sourcesTexte}
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold">{contenu.communication.marcheTitre}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {contenu.communication.marcheTexte}
            </p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {contenu.communication.marche.map((indicateur) => (
                <Pastille key={indicateur}>{indicateur}</Pastille>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section
        intitule={contenu.conformite.intitule}
        titre={contenu.conformite.titre}
        chapo={contenu.conformite.chapo}
      >
        <dl className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {contenu.conformite.elements.map((element) => (
            <div key={element.titre}>
              <dt className="font-semibold">{element.titre}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{element.texte}</dd>
            </div>
          ))}
        </dl>
        {/* L'avertissement est du texte, pas un encart alarmant : il dit une limite, il ne signale pas un danger. */}
        <p className="mt-10 max-w-3xl border-l-2 border-border pl-5 text-sm leading-relaxed text-muted-foreground">
          {contenu.conformite.avertissement}
        </p>
      </Section>

      <Section intitule={contenu.perimetre.intitule} titre={contenu.perimetre.titre}>
        <ul className="flex max-w-2xl flex-col gap-3">
          {contenu.perimetre.elements.map((element) => (
            <li key={element} className="flex gap-3 text-base leading-relaxed">
              <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
              <span className="text-muted-foreground">{element}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section>
        <div className="rounded-2xl border border-border bg-card px-6 py-12 sm:px-12">
          <div className="max-w-2xl">
            <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">{contenu.final.titre}</h2>
            <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">{contenu.final.texte}</p>
            <div className="mt-8">{appels}</div>
          </div>
        </div>
      </Section>
    </>
  );
}
