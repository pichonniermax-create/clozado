import { ActionLink } from "@/components/action-link";
import { EcranRegles, EcranSuivi, EcranTableauDeBord } from "@/components/ecran-produit";
import { Card, Container, Puce, Section } from "@/components/layout-primitives";
import { Mouvement } from "@/components/mouvement";
import type { ContenuMetier, Element } from "@/content/types";
import { getDictionary, type Locale } from "@/lib/i18n";
import { classeTitre, sansOrphelin } from "@/lib/titres";
import { DEMO_URL, SITE_CONFIG } from "@/lib/site-config";

/** Une pastille : un sujet de veille, un indicateur. Bordée, jamais colorée — ce n'est pas un état. */
function Pastille({ children }: { children: React.ReactNode }) {
  return (
    <li className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-card-foreground transition-colors duration-200 ease-out hover:border-primary">
      {children}
    </li>
  );
}

/**
 * Les irritants et leurs réponses, numérotés. Le numéro n'est pas une
 * décoration : la réponse `02` répond à l'irritant `02`, et c'est ce
 * couplage que la numérotation rend lisible. Il est écrit dans la police du
 * site, en chiffres tabulaires — plus de seconde famille pour un chiffre.
 */
function ListeNumerotee({ elements }: { elements: readonly Element[] }) {
  return (
    <ol className="grid gap-4 sm:grid-cols-2">
      {elements.map((element, rang) => (
        <li key={element.titre} data-entree data-rang={rang}>
          <Card className="h-full">
            <p className="text-sm font-semibold tabular-nums text-primary-ink">{String(rang + 1).padStart(2, "0")}</p>
            <h3 className="mt-4 text-xl font-bold tracking-tight text-foreground">{sansOrphelin(element.titre)}</h3>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{element.texte}</p>
          </Card>
        </li>
      ))}
    </ol>
  );
}

/**
 * Un intertitre de sous-partie — dans la communication, qui en compte trois.
 * Il reçoit son texte en enfant : c'est ici qu'on lui ôte son mot orphelin,
 * et pas au point d'appel, pour que la règle tienne partout où il sert.
 */
function SousTitre({ children }: { children: string }) {
  return <h3 className="text-xl font-bold tracking-tight text-foreground">{sansOrphelin(children)}</h3>;
}

/**
 * LE GABARIT DES TROIS PAGES MÉTIER. Elles ont la même charpente — ce qui
 * coince, ce que le produit y répond dans le MÊME ORDRE (d'où les numéros),
 * les indicateurs, à qui l'on écrit et avec quoi, la conformité, le
 * périmètre — et ne diffèrent que par leur contenu.
 *
 * Elles reçoivent le traitement de l'accueil (2026-09-18) : le propos posé
 * à côté d'un écran du produit REDESSINÉ en HTML — aucune image ici non
 * plus —, des titres lourds et fluides, des largeurs qui se resserrent à
 * mesure que le propos se densifie, et le même mouvement (entrées uniques,
 * compteurs, survols). Les écrans montrés sont ceux que la section prouve :
 * le Suivi en tête, le tableau de bord en face des indicateurs, les règles
 * de relance en face de ce qu'on écrit.
 *
 * Aucun texte ici : tout vient de `content/<langue>/<métier>.ts`, dont la
 * forme est vérifiée à la compilation (`ContenuMetier`).
 */
export function PageMetier({ locale, contenu }: { locale: Locale; contenu: ContenuMetier }) {
  const { common, ecrans, mentionEcrans } = getDictionary(locale);

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

  return (
    <>
      <Mouvement />

      {/* PREMIER ÉCRAN — le propos du métier à gauche, ce qui attend une
          action à droite. Les colonnes s'alignent en haut : le titre est
          très grand, l'aligner au milieu le ferait flotter au-dessus du vide. */}
      <section className="border-b border-border">
        <Container largeur="large" className="py-12 sm:py-14 lg:py-12">
          <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
            <div data-entree className="min-w-0 lg:col-span-7">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {contenu.hero.secteur}
              </p>
              <h1 className={`mt-5 text-foreground ${classeTitre(contenu.hero.titre)}`}>{sansOrphelin(contenu.hero.titre)}</h1>
              <p className="mesure mt-6 text-pretty text-chapo text-muted-foreground">{contenu.hero.chapo}</p>
              <p className="mesure mt-3 text-pretty text-chapo text-muted-foreground">{contenu.hero.precision}</p>
              <div className="mt-8">{appels}</div>
            </div>
            <div data-entree data-rang={1} className="ecran-compact min-w-0 lg:col-span-5">
              <EcranSuivi ecran={ecrans.suivi} sansLegende />
              <p className="mt-4 text-sm text-muted-foreground">{mentionEcrans}</p>
            </div>
          </div>
        </Container>
      </section>

      <Section intitule={contenu.coince.intitule} titre={contenu.coince.titre} bordered={false}>
        <ListeNumerotee elements={contenu.coince.elements} />
      </Section>

      <Section
        intitule={contenu.reponse.intitule}
        titre={contenu.reponse.titre}
        chapo={contenu.reponse.chapo}
        ton="doux"
      >
        <ListeNumerotee elements={contenu.reponse.elements} />
      </Section>

      {/* LES INDICATEURS — la liste de ce métier, et l'écran où on les lit. */}
      <Section
        intitule={contenu.indicateurs.intitule}
        titre={contenu.indicateurs.titre}
        chapo={contenu.indicateurs.chapo}
        largeur="large"
      >
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div data-entree className="min-w-0 lg:col-span-5">
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {contenu.indicateurs.elements.map((element) => (
                <Pastille key={element}>{element}</Pastille>
              ))}
            </ul>
            <p className="mt-8 text-sm leading-relaxed text-muted-foreground">{contenu.indicateurs.note}</p>
          </div>
          <div data-entree data-rang={1} className="min-w-0 lg:col-span-7">
            <EcranTableauDeBord ecran={ecrans.tableauDeBord} />
          </div>
        </div>
      </Section>

      {/* CE QU'ON ÉCRIT, ET À QUI — en face des règles qui l'écrivent. */}
      <Section
        intitule={contenu.communication.intitule}
        titre={contenu.communication.titre}
        chapo={contenu.communication.chapo}
        largeur="large"
        ton="doux"
      >
        <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
          <div className="flex min-w-0 flex-col gap-12 lg:col-span-7">
            <div data-entree>
              <SousTitre>{contenu.communication.ciblesTitre}</SousTitre>
              <dl className="mt-6 grid gap-x-12 gap-y-6 sm:grid-cols-2">
                {contenu.communication.cibles.map((cible) => (
                  <div key={cible.titre}>
                    <dt className="text-sm font-semibold text-foreground">{sansOrphelin(cible.titre)}</dt>
                    <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{cible.texte}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div data-entree data-rang={1}>
              <SousTitre>{contenu.communication.veilleTitre}</SousTitre>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{contenu.communication.veilleTexte}</p>
              <ul className="mt-6 flex flex-wrap gap-2">
                {contenu.communication.sujets.map((sujet) => (
                  <Pastille key={sujet}>{sujet}</Pastille>
                ))}
              </ul>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{contenu.communication.sourcesTexte}</p>
            </div>

            <div data-entree data-rang={2}>
              <SousTitre>{contenu.communication.marcheTitre}</SousTitre>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{contenu.communication.marcheTexte}</p>
              <ul className="mt-6 grid gap-2 sm:grid-cols-2">
                {contenu.communication.marche.map((indicateur) => (
                  <Pastille key={indicateur}>{indicateur}</Pastille>
                ))}
              </ul>
            </div>
          </div>

          <div data-entree data-rang={1} className="min-w-0 lg:col-span-5">
            <EcranRegles ecran={ecrans.regles} />
          </div>
        </div>
      </Section>

      <Section
        intitule={contenu.conformite.intitule}
        titre={contenu.conformite.titre}
        chapo={contenu.conformite.chapo}
        largeur="lisible"
      >
        <dl className="grid gap-x-12 gap-y-10 sm:grid-cols-2">
          {contenu.conformite.elements.map((element, rang) => (
            <div key={element.titre} data-entree data-rang={rang}>
              <dt className="font-semibold text-foreground">{sansOrphelin(element.titre)}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{element.texte}</dd>
            </div>
          ))}
        </dl>
        {/* L'avertissement est du texte, pas un encart alarmant : il dit une limite, il ne signale pas un danger. */}
        <p
          data-entree
          className="mt-12 max-w-3xl border-l-2 border-border pl-6 text-sm leading-relaxed text-muted-foreground"
        >
          {contenu.conformite.avertissement}
        </p>
      </Section>

      <Section intitule={contenu.perimetre.intitule} titre={contenu.perimetre.titre} largeur="etroite">
        <ul className="flex flex-col gap-4">
          {contenu.perimetre.elements.map((element, rang) => (
            <li key={element} data-entree data-rang={rang} className="flex gap-4 text-base leading-relaxed">
              <Puce />
              <span className="text-muted-foreground">{element}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section>
        <div data-entree className="rounded-xl border border-border bg-card px-6 py-16 sm:px-12">
          <div className="max-w-3xl">
            <h2 className="text-balance text-titre-2 text-foreground">{sansOrphelin(contenu.final.titre)}</h2>
            <p className="mt-6 text-pretty text-chapo text-muted-foreground">{contenu.final.texte}</p>
            <div className="mt-8">{appels}</div>
          </div>
        </div>
      </Section>
    </>
  );
}
