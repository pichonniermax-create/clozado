import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card } from "@/components/layout-primitives";
import { HeroPage } from "@/components/hero-page";
import { Mouvement } from "@/components/mouvement";
import { SectionEditoriale } from "@/components/section-editoriale";
import { getDictionary, isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";
import { sansOrphelin } from "@/lib/titres";

export async function generateMetadata(props: PageProps<"/[locale]/carrieres">): Promise<Metadata> {
  const { locale } = await props.params;
  if (!isLocale(locale)) return {};
  const { carrieres } = getDictionary(locale);
  return pageMetadata({
    locale,
    route: "carrieres",
    titre: carrieres.meta.titre,
    description: carrieres.meta.description,
  });
}

/**
 * /fr/carrieres — SOBRE, et qui dit qu'aucun poste n'est ouvert plutôt que
 * d'afficher une liste d'offres qui ne bouge pas. Aucun effectif annoncé,
 * aucun avantage promis : la manière de travailler, et une adresse.
 */
export default async function Carrieres(props: PageProps<"/[locale]/carrieres">) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();
  const { carrieres } = getDictionary(locale);

  return (
    <div className="editorial">
      <Mouvement />

      <HeroPage surtitre={carrieres.hero.surtitre} titre={carrieres.hero.titre} chapo={carrieres.hero.chapo} />

      <SectionEditoriale
        numero="01"
        intitule={carrieres.activite.intitule}
        titre={carrieres.activite.titre}
        largeurContenu="lg:col-start-4 lg:col-span-7"
      >
        <p data-entree className="mesure leading-relaxed text-muted-foreground">
          {carrieres.activite.texte}
        </p>
      </SectionEditoriale>

      <SectionEditoriale
        numero="02"
        intitule={carrieres.methode.intitule}
        titre={carrieres.methode.titre}
        ton="doux"
        largeurContenu="lg:col-start-4 lg:col-span-9"
      >
        <ul className="grid gap-4 sm:grid-cols-2">
          {carrieres.methode.elements.map((element, rang) => (
            <li key={element.titre} data-entree data-rang={rang}>
              <Card className="h-full">
                <p className="tabulaire text-sm text-muted-foreground">{String(rang + 1).padStart(2, "0")}</p>
                <h3 className="mt-4 text-xl font-bold tracking-tight text-foreground">{sansOrphelin(element.titre)}</h3>
                <p className="mesure mt-4 text-sm leading-relaxed text-muted-foreground">{element.texte}</p>
              </Card>
            </li>
          ))}
        </ul>
      </SectionEditoriale>

      <SectionEditoriale
        numero="03"
        intitule={carrieres.candidature.intitule}
        titre={carrieres.candidature.titre}
        largeurContenu="lg:col-start-4 lg:col-span-7"
      >
        <div data-entree>
          <p className="mesure leading-relaxed text-muted-foreground">{carrieres.candidature.texte}</p>
          {/* Une adresse, pas un formulaire : rien à héberger, rien à stocker, aucun tiers. */}
          <p className="mt-8">
            <a
              href={`mailto:${carrieres.candidature.adresse}`}
              className="text-titre-3 text-primary-ink underline underline-offset-8 transition-colors duration-200 ease-out hover:text-primary-hover"
            >
              {carrieres.candidature.adresse}
            </a>
          </p>
          <p className="mesure mt-6 text-sm text-muted-foreground">{carrieres.candidature.mention}</p>
        </div>
      </SectionEditoriale>
    </div>
  );
}
