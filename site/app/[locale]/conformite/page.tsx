import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionLink } from "@/components/action-link";
import { Card, Puce } from "@/components/layout-primitives";
import { HeroPage } from "@/components/hero-page";
import { Mouvement } from "@/components/mouvement";
import { SectionEditoriale } from "@/components/section-editoriale";
import { getDictionary, isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";
import { DEMO_URL, SITE_CONFIG } from "@/lib/site-config";
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
        numero="01"
        intitule={conformite.blocs.intitule}
        titre={conformite.blocs.titre}
        largeurContenu="lg:col-start-4 lg:col-span-9"
      >
        <ul className="grille-cartes" data-colonnes="2-lg">
          {conformite.blocs.elements.map((element, rang) => (
            <li key={element.titre} data-entree data-rang={rang}>
              <Card className="h-full">
                <p className="tabulaire text-sm text-muted-foreground">{String(rang + 1).padStart(2, "0")}</p>
                <h3 className="mt-4 text-xl font-bold tracking-tight text-foreground">{sansOrphelin(element.titre)}</h3>
                <p className="mesure mt-4 text-sm leading-relaxed text-muted-foreground">{element.texte}</p>
                <ul className="mt-6 flex flex-col gap-3">
                  {element.points.map((point) => (
                    <li key={point} className="flex gap-3 text-sm leading-relaxed">
                      <Puce />
                      <span className="mesure text-muted-foreground">{point}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </li>
          ))}
        </ul>
      </SectionEditoriale>

      <SectionEditoriale
        numero="02"
        intitule={conformite.limite.intitule}
        titre={conformite.limite.titre}
        ton="doux"
        largeurContenu="lg:col-start-4 lg:col-span-7"
      >
        <p data-entree className="mesure border-l-2 border-border pl-6 leading-relaxed text-muted-foreground">
          {conformite.limite.texte}
        </p>
      </SectionEditoriale>

      <section className="border-t border-border py-20 sm:py-28 lg:py-36">
        <div className="editorial-conteneur">
          <div className="grid grid-cols-12 gap-x-6">
            <div
              data-entree
              className="col-span-12 rounded-xl border border-border bg-card px-6 py-16 sm:px-12 lg:col-start-3 lg:col-span-10"
            >
              <h2 className="text-balance text-titre-2 text-foreground">{sansOrphelin(conformite.final.titre)}</h2>
              <p className="mesure mt-6 text-pretty text-chapo text-muted-foreground">{conformite.final.texte}</p>
              <div className="mt-10">{appels}</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
