import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionLink } from "@/components/action-link";
import { EcranFunnel, EcranRegles, EcranSuivi, EcranTableauDeBord } from "@/components/ecran-produit";
import { Card, Puce } from "@/components/layout-primitives";
import { HeroPage } from "@/components/hero-page";
import { Mouvement } from "@/components/mouvement";
import { SectionEditoriale } from "@/components/section-editoriale";
import { getDictionary, isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";
import { path, sousEntrees } from "@/lib/routes";
import { DEMO_URL, SITE_CONFIG } from "@/lib/site-config";
import { sansOrphelin } from "@/lib/titres";

export async function generateMetadata(props: PageProps<"/[locale]/produit">): Promise<Metadata> {
  const { locale } = await props.params;
  if (!isLocale(locale)) return {};
  const { produit } = getDictionary(locale);
  return pageMetadata({ locale, route: "produit", titre: produit.meta.titre, description: produit.meta.description });
}

/**
 * /fr/produit — LA PAGE CENTRALE DU SITE : les sept écrans du produit, dans
 * l'ordre où l'on s'en sert. Quatre d'entre eux sont REDESSINÉS en HTML
 * (jamais photographiés) ; les trois autres se décrivent et s'ouvrent en
 * démonstration.
 *
 * Les trois pages métier sont désormais ses filles : elles sont listées ici
 * comme dans le déroulant de la barre.
 */
export default async function Produit(props: PageProps<"/[locale]/produit">) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();
  const { common, produit, ecrans, mentionEcrans } = getDictionary(locale);

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

  const ecranDe = (cle?: "suivi" | "tableauDeBord" | "regles" | "funnel") => {
    switch (cle) {
      case "suivi":
        return <EcranSuivi ecran={ecrans.suivi} />;
      case "tableauDeBord":
        return <EcranTableauDeBord ecran={ecrans.tableauDeBord} />;
      case "regles":
        return <EcranRegles ecran={ecrans.regles} />;
      case "funnel":
        return <EcranFunnel ecran={ecrans.funnel} />;
      default:
        return null;
    }
  };

  return (
    <div className="editorial">
      <Mouvement />

      <HeroPage
        surtitre={produit.hero.surtitre}
        titre={produit.hero.titre}
        chapo={produit.hero.chapo}
        precision={produit.hero.precision}
        appels={appels}
      />

      <SectionEditoriale
        numero="01"
        intitule={produit.ecrans.intitule}
        titre={produit.ecrans.titre}
        chapo={produit.ecrans.chapo}
        largeurContenu="lg:col-start-2 lg:col-span-11"
      >
        <div className="flex flex-col gap-20 lg:gap-28">
          {produit.ecrans.elements.map((element, rang) => {
            const ecran = ecranDe("ecran" in element ? element.ecran : undefined);
            return (
              <div key={element.cle} className="grid grid-cols-12 items-center gap-x-6 gap-y-8">
                <div
                  data-entree
                  className={
                    ecran && rang % 2 === 1
                      ? "col-span-12 min-w-0 lg:order-2 lg:col-start-9 lg:col-span-4"
                      : ecran
                        ? "col-span-12 min-w-0 lg:col-span-4"
                        : "col-span-12 min-w-0 lg:col-span-6"
                  }
                >
                  <p className="tabulaire text-sm text-muted-foreground">{String(rang + 1).padStart(2, "0")}</p>
                  <h3 className="mt-4 text-balance text-titre-3 text-foreground">{sansOrphelin(element.titre)}</h3>
                  <p className="mesure mt-4 text-pretty leading-relaxed text-muted-foreground">{element.texte}</p>
                  <ul className="mt-8 flex flex-col gap-4">
                    {element.points.map((point) => (
                      <li key={point} className="flex gap-4 text-sm leading-relaxed">
                        <Puce />
                        <span className="mesure text-muted-foreground">{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {ecran && (
                  <div
                    data-entree
                    data-rang={1}
                    className={
                      rang % 2 === 1
                        ? "col-span-12 min-w-0 lg:order-1 lg:col-span-7"
                        : "col-span-12 min-w-0 lg:col-start-6 lg:col-span-7"
                    }
                  >
                    {ecran}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="mesure mt-12 text-sm text-muted-foreground">{mentionEcrans}</p>
      </SectionEditoriale>

      <SectionEditoriale
        numero="02"
        intitule={produit.metiers.intitule}
        titre={produit.metiers.titre}
        chapo={produit.metiers.chapo}
        ton="doux"
        largeurContenu="lg:col-start-4 lg:col-span-9"
      >
        <ul className="grid gap-4 sm:grid-cols-3">
          {sousEntrees("produit").map((cle, rang) => (
            <li key={cle} data-entree data-rang={rang}>
              <Link
                href={path(locale, cle)}
                className="block h-full rounded-xl border border-border bg-card p-6 text-card-foreground transition-colors duration-200 ease-out hover:border-primary"
              >
                <h3 className="text-xl font-bold tracking-tight text-foreground">{sansOrphelin(common.nav[cle])}</h3>
                <p className="mt-6 text-sm font-medium text-primary-ink underline underline-offset-4">
                  {common.actions.enSavoirPlus}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </SectionEditoriale>

      <SectionEditoriale
        numero="03"
        intitule={produit.perimetre.intitule}
        titre={produit.perimetre.titre}
        largeurContenu="lg:col-start-4 lg:col-span-6"
      >
        <ul className="flex flex-col gap-4">
          {produit.perimetre.elements.map((element, rang) => (
            <li key={element} data-entree data-rang={rang} className="flex gap-4 leading-relaxed">
              <Puce />
              <span className="mesure text-muted-foreground">{element}</span>
            </li>
          ))}
        </ul>
      </SectionEditoriale>

      <section className="border-t border-border py-20 sm:py-28 lg:py-36">
        <div className="editorial-conteneur">
          <div className="grid grid-cols-12 gap-x-6">
            <div
              data-entree
              className="col-span-12 rounded-xl border border-border bg-card px-6 py-16 sm:px-12 lg:col-start-3 lg:col-span-10"
            >
              <h2 className="text-balance text-titre-2 text-foreground">{sansOrphelin(produit.final.titre)}</h2>
              <p className="mesure mt-6 text-pretty text-chapo text-muted-foreground">{produit.final.texte}</p>
              <div className="mt-10">{appels}</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
