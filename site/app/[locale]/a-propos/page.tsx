import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionLink } from "@/components/action-link";
import { Card } from "@/components/layout-primitives";
import { HeroPage } from "@/components/hero-page";
import { Mouvement } from "@/components/mouvement";
import { SectionEditoriale } from "@/components/section-editoriale";
import { getDictionary, isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";
import { DEMO_URL, SITE_CONFIG } from "@/lib/site-config";
import { sansOrphelin } from "@/lib/titres";

export async function generateMetadata(props: PageProps<"/[locale]/a-propos">): Promise<Metadata> {
  const { locale } = await props.params;
  if (!isLocale(locale)) return {};
  const { aPropos } = getDictionary(locale);
  return pageMetadata({ locale, route: "aPropos", titre: aPropos.meta.titre, description: aPropos.meta.description });
}

/**
 * /fr/a-propos — POURQUOI l'outil existe, POUR QUI, et COMMENT il est
 * construit. Aucune information personnelle, aucun effectif, aucune date de
 * création : uniquement des partis pris qui se constatent dans le produit.
 */
export default async function APropos(props: PageProps<"/[locale]/a-propos">) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();
  const { common, aPropos } = getDictionary(locale);

  const cartes = (elements: readonly { titre: string; texte: string }[]) => (
    <ul className="grid gap-4 sm:grid-cols-3">
      {elements.map((element, rang) => (
        <li key={element.titre} data-entree data-rang={rang}>
          <Card className="h-full">
            <h3 className="text-xl font-bold tracking-tight text-foreground">{sansOrphelin(element.titre)}</h3>
            <p className="mesure mt-4 text-sm leading-relaxed text-muted-foreground">{element.texte}</p>
          </Card>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="editorial">
      <Mouvement />

      <HeroPage surtitre={aPropos.hero.surtitre} titre={aPropos.hero.titre} chapo={aPropos.hero.chapo} />

      <SectionEditoriale
        numero="01"
        intitule={aPropos.pourquoi.intitule}
        titre={aPropos.pourquoi.titre}
        largeurContenu="lg:col-start-4 lg:col-span-9"
      >
        {cartes(aPropos.pourquoi.elements)}
      </SectionEditoriale>

      <SectionEditoriale
        numero="02"
        intitule={aPropos.pourQui.intitule}
        titre={aPropos.pourQui.titre}
        chapo={aPropos.pourQui.chapo}
        ton="doux"
        largeurContenu="lg:col-start-4 lg:col-span-9"
      >
        {cartes(aPropos.pourQui.elements)}
      </SectionEditoriale>

      <SectionEditoriale
        numero="03"
        intitule={aPropos.comment.intitule}
        titre={aPropos.comment.titre}
        largeurContenu="lg:col-start-4 lg:col-span-9"
      >
        <dl className="grid gap-x-12 gap-y-10 sm:grid-cols-2">
          {aPropos.comment.elements.map((element, rang) => (
            <div key={element.titre} data-entree data-rang={rang}>
              <dt className="text-xl font-bold tracking-tight text-foreground">{sansOrphelin(element.titre)}</dt>
              <dd className="mesure mt-4 text-sm leading-relaxed text-muted-foreground">{element.texte}</dd>
            </div>
          ))}
        </dl>
      </SectionEditoriale>

      <section className="border-t border-border py-20 sm:py-28 lg:py-36">
        <div className="editorial-conteneur">
          <div className="grid grid-cols-12 gap-x-6">
            <div
              data-entree
              className="col-span-12 rounded-xl border border-border bg-card px-6 py-16 sm:px-12 lg:col-start-3 lg:col-span-10"
            >
              <h2 className="text-balance text-titre-2 text-foreground">{sansOrphelin(aPropos.final.titre)}</h2>
              <p className="mesure mt-6 text-pretty text-chapo text-muted-foreground">{aPropos.final.texte}</p>
              <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:items-center">
                <ActionLink href={DEMO_URL} externe mentionNouvelOnglet={common.actions.nouvelOnglet}>
                  {common.actions.ouvrirLaDemo}
                </ActionLink>
                <ActionLink
                  href={SITE_CONFIG.bookingUrl}
                  variante="secondaire"
                  externe
                  mentionNouvelOnglet={common.actions.nouvelOnglet}
                >
                  {common.actions.reserverUneDemo}
                </ActionLink>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
