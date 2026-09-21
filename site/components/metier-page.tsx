import { ActionLink } from "@/components/action-link";
import { EcranRegles, EcranTableauDeBord } from "@/components/ecran-produit";
import { EcranChronologie, EcranJaugeParcours, EcranTableauCourtage } from "@/components/ecrans-metiers";
import { Card, ListeStructuree } from "@/components/layout-primitives";
import { SectionEditoriale } from "@/components/section-editoriale";
import { Mouvement } from "@/components/mouvement";
import type { ContenuMetier, Element } from "@/content/types";
import { avecReservation } from "@/lib/appels";
import { getDictionary, type Locale } from "@/lib/i18n";
import { classeTitre, sansOrphelin } from "@/lib/titres";
import { DEMO_URL, RESERVATION_EN_LIGNE, RESERVATION_URL } from "@/lib/site-config";

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
    <ol className="grille-cartes" data-colonnes="2">
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
 * compteurs, survols).
 *
 * L'ÉCRAN DU PREMIER PLAN EST PROPRE AU MÉTIER (2026-09-18) : chronologie
 * d'un dossier pour la gestion de patrimoine, tableau chiffré pour le
 * courtage, jauge de parcours pour la transaction immobilière — trois formes,
 * trois jeux de données, aucun libellé commun. Les deux écrans suivants
 * restent ceux que la section prouve : le tableau de bord en face des
 * indicateurs, les règles de relance en face de ce qu'on écrit.
 *
 * Aucun texte ici : tout vient de `content/<langue>/<métier>.ts`, dont la
 * forme est vérifiée à la compilation (`ContenuMetier`).
 */
/**
 * LA COLONNE DE CONTENU DE LA PAGE — une seule, pour toutes ses sections.
 * Elles étaient centrées à quatre largeurs différentes, si bien que le
 * contenu commençait à quatre abscisses différentes selon la section.
 */

export function PageMetier({
  locale,
  contenu,
  cle,
}: {
  locale: Locale;
  contenu: ContenuMetier;
  /** Le métier de la page : c'est lui qui décide de l'écran de preuve. */
  cle: "cgp" | "courtiers" | "immobilier";
}) {
  const { common, ecrans, ecransMetiers, mentionEcrans } = getDictionary(locale);

  /**
   * L'ÉCRAN DE PREUVE DU PREMIER PLAN — un par métier, jamais le même.
   * Les trois pages montraient auparavant le même tableau Suivi, avec les
   * mêmes noms et les mêmes montants.
   */
  const ecranDuMetier =
    cle === "cgp" ? (
      <EcranChronologie ecran={ecransMetiers.cgp} />
    ) : cle === "courtiers" ? (
      <EcranTableauCourtage ecran={ecransMetiers.courtiers} />
    ) : (
      <EcranJaugeParcours ecran={ecransMetiers.immobilier} />
    );

  /*
   * LE PREMIER BOUTON OUVRE LA DÉMONSTRATION, et c'est le seul tant que la
   * prise de rendez-vous n'est pas en ligne.
   *
   * Le site envoyait le geste principal sur un agenda TIERS : le visiteur
   * quittait le domaine avant d'avoir rien vu, et sa saisie partait chez un
   * prestataire. Ce tiers a disparu du site le 2026-09-21. La réservation
   * reviendra sur notre propre application (`RESERVATION_URL`) ; d'ici là,
   * un seul geste est proposé, parce qu'un bouton qui mène à une page
   * absente est pire que pas de bouton.
   */
  const appels = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <ActionLink href={DEMO_URL} externe mentionNouvelOnglet={common.actions.nouvelOnglet}>
        {common.actions.ouvrirLaDemo}
      </ActionLink>
      {RESERVATION_EN_LIGNE && (
        <ActionLink href={RESERVATION_URL} variante="secondaire" externe mentionNouvelOnglet={common.actions.nouvelOnglet}>
          {common.actions.reserverUneDemo}
        </ActionLink>
      )}
    </div>
  );

  return (
    <div className="editorial">
      <Mouvement />

      {/* PREMIER ÉCRAN — le propos du métier et l'écran qui le prouve, DEUX
          COLONNES DE LARGEUR ÉGALE, le bloc centré dans le conteneur. */}
      <section className="border-b border-border">
        <div className="editorial-conteneur py-12 sm:py-12 lg:py-12">
          <div className="duo">
            <div data-entree>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {contenu.hero.secteur}
              </p>
              <h1 className={`mt-6 text-foreground ${classeTitre(contenu.hero.titre)}`}>{sansOrphelin(contenu.hero.titre)}</h1>
              <p className="mesure mt-6 text-pretty text-chapo text-foreground">{contenu.hero.chapo}</p>
              <p className="mesure mt-3 text-pretty text-chapo text-foreground">{contenu.hero.precision}</p>
              <div className="mt-6">{appels}</div>
            </div>
            <div data-entree data-rang={1} className="ecran-compact">
              {ecranDuMetier}
              <p className="mesure mt-4 text-sm text-muted-foreground">{mentionEcrans}</p>
            </div>
          </div>
        </div>
      </section>

      <SectionEditoriale intitule={contenu.coince.intitule} titre={contenu.coince.titre}>
        <ListeNumerotee elements={contenu.coince.elements} />
      </SectionEditoriale>

      <SectionEditoriale
        intitule={contenu.reponse.intitule}
        titre={contenu.reponse.titre}
        chapo={contenu.reponse.chapo}
        ton="doux"
      >
        <ListeNumerotee elements={contenu.reponse.elements} />
      </SectionEditoriale>

      {/* LES INDICATEURS — la liste de ce métier, et l'écran où on les lit. */}
      <SectionEditoriale
        intitule={contenu.indicateurs.intitule}
        titre={contenu.indicateurs.titre}
        chapo={contenu.indicateurs.chapo}
      >
        <div className="duo">
          <div data-entree>
            {/* Des contenus, pas des étiquettes : les pastilles ne servent
                qu'aux filtres et aux étiquettes (2026-09-21). */}
            <ListeStructuree elements={contenu.indicateurs.elements.map((e) => ({ intitule: e }))} />
            <p className="mt-6 text-sm leading-relaxed text-muted-foreground">{contenu.indicateurs.note}</p>
          </div>
          <div data-entree data-rang={1}>
            <EcranTableauDeBord ecran={ecrans.tableauDeBord} />
          </div>
        </div>
      </SectionEditoriale>

      {/* CE QU'ON ÉCRIT, ET À QUI — en face des règles qui l'écrivent. */}
      <SectionEditoriale
        intitule={contenu.communication.intitule}
        titre={contenu.communication.titre}
        chapo={contenu.communication.chapo}
        ton="doux"
      >
        <div className="duo">
          <div className="flex flex-col gap-12">
            <div data-entree>
              <SousTitre>{contenu.communication.ciblesTitre}</SousTitre>
              <dl className="grille-cartes grille-large mt-6" data-colonnes="2">
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
              <ul className="grille-cartes mt-6" data-colonnes="2" style={{ "--ecart": "0.5rem" } as React.CSSProperties}>
                {contenu.communication.marche.map((indicateur) => (
                  <Pastille key={indicateur}>{indicateur}</Pastille>
                ))}
              </ul>
            </div>
          </div>

          <div data-entree data-rang={1}>
            <EcranRegles ecran={ecrans.regles} />
          </div>
        </div>
      </SectionEditoriale>

      <SectionEditoriale
        intitule={contenu.conformite.intitule}
        titre={contenu.conformite.titre}
        chapo={contenu.conformite.chapo}
      >
        <dl className="grille-cartes grille-large" data-colonnes="2">
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
          className="mesure mt-12 border-l border-border pl-6 text-sm leading-relaxed text-muted-foreground"
        >
          {contenu.conformite.avertissement}
        </p>
      </SectionEditoriale>

      <SectionEditoriale intitule={contenu.perimetre.intitule} titre={contenu.perimetre.titre} ton="doux">
        <ListeStructuree elements={contenu.perimetre.elements} colonnes={2} />
      </SectionEditoriale>

      <section className="border-t border-border py-24 sm:py-24 lg:py-36">
        <div className="editorial-conteneur">
          {/* La carte de clôture : pleine largeur du conteneur, et son
              texte centré comme tout ce qui annonce. */}
          <div data-entree className="rounded-xl border border-border bg-card px-6 py-12 sm:px-12">
            <div className="colonne-lecture-centree">
              <h2 className="text-balance text-titre-2 text-foreground">{sansOrphelin(contenu.final.titre)}</h2>
              <p className="mt-6 text-pretty text-chapo text-foreground">
                {avecReservation(contenu.final.texte, contenu.final.texteReservation)}
              </p>
              <div className="appels mt-6 flex">{appels}</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
