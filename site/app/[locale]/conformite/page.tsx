import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionLink } from "@/components/action-link";
import { Card, ListeStructuree } from "@/components/layout-primitives";
import { HeroPage } from "@/components/hero-page";
import { Mouvement } from "@/components/mouvement";
import { SectionEditoriale } from "@/components/section-editoriale";
import { avecReservation } from "@/lib/appels";
import { getDictionary, isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";
import { DEMO_URL, RESERVATION_EN_LIGNE, RESERVATION_URL } from "@/lib/site-config";
import { sansOrphelin } from "@/lib/titres";

export async function generateMetadata(props: PageProps<"/[locale]/conformite">): Promise<Metadata> {
  const { locale } = await props.params;
  if (!isLocale(locale)) return {};
  const { conformite } = getDictionary(locale);
  return pageMetadata({
    locale,
    route: "conformite",
    titre: conformite.meta.titre,
    description: conformite.meta.description,
  });
}

/**
 * /fr/conformite — LA CONFORMITÉ ÉCRITE COMME UNE PAGE PRODUIT : des
 * mécanismes qui s'ouvrent dans la démonstration, jamais des intentions.
 * Les mentions de l'éditeur restent aux pages légales.
 */
export default async function Conformite(props: PageProps<"/[locale]/conformite">) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();
  const { common, conformite } = getDictionary(locale);

  /* L'ordre des deux appels : voir `components/metier-page.tsx`. */
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

      <HeroPage
        surtitre={conformite.hero.surtitre}
        titre={conformite.hero.titre}
        chapo={conformite.hero.chapo}
        precision={conformite.hero.precision}
        appels={appels}
      />

      <SectionEditoriale
        intitule={conformite.blocs.intitule}
        titre={conformite.blocs.titre}
      >
        <ul className="grille-cartes" data-colonnes="2-lg">
          {conformite.blocs.elements.map((element, rang) => (
            <li key={element.titre} data-entree data-rang={rang}>
              <Card className="h-full">
                <p className="tabulaire text-sm text-muted-foreground">{String(rang + 1).padStart(2, "0")}</p>
                <h3 className="mt-4 text-xl font-bold tracking-tight text-foreground">{sansOrphelin(element.titre)}</h3>
                <p className="mesure mt-4 text-sm leading-relaxed text-muted-foreground">{element.texte}</p>
                <div className="mt-6">
                  <ListeStructuree elements={element.points} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </SectionEditoriale>

      <SectionEditoriale
        intitule={conformite.limite.intitule}
        titre={conformite.limite.titre}
        ton="doux"
      >
        <p data-entree className="mesure border-l border-border pl-6 leading-relaxed text-muted-foreground">
          {conformite.limite.texte}
        </p>
      </SectionEditoriale>

      <section className="border-t border-border py-24 sm:py-24 lg:py-36">
        <div className="editorial-conteneur">
          {/* La carte de clôture : pleine largeur du conteneur, texte centré. */}
          <div data-entree className="rounded-xl border border-border bg-card px-6 py-12 sm:px-12">
            <div className="colonne-lecture-centree">
              <h2 className="text-balance text-titre-2 text-foreground">{sansOrphelin(conformite.final.titre)}</h2>
              <p className="mesure mt-6 text-pretty text-chapo text-foreground">{avecReservation(conformite.final.texte, conformite.final.texteReservation)}</p>
              <div className="mt-12">{appels}</div>
          </div>
          </div>
        </div>
      </section>
    </div>
  );
}
