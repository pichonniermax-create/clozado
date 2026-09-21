import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionLink } from "@/components/action-link";
import {
  EcranApercu,
  EcranColonnes,
  EcranCommission,
  EcranFiche,
  EcranSerie,
  EcranVaEtVient,
} from "@/components/ecrans-parcours";
import { Puce } from "@/components/layout-primitives";
import { HeroPage } from "@/components/hero-page";
import { Mouvement } from "@/components/mouvement";
import { SectionEditoriale } from "@/components/section-editoriale";
import { avecReservation } from "@/lib/appels";
import { getDictionary, isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";
import { path, sousEntrees } from "@/lib/routes";
import { DEMO_URL, RESERVATION_EN_LIGNE, RESERVATION_URL } from "@/lib/site-config";
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
/** La colonne unique de la page — la même pour toutes ses sections. */
const COLONNE = "lg:col-start-4 lg:col-span-9";

export default async function Produit(props: PageProps<"/[locale]/produit">) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();
  const { common, produit, parcoursProduit, mentionEcrans } = getDictionary(locale);

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

  /**
   * L'ÉCRAN DE CHAQUE ÉTAPE — six formes différentes, et aucune reprise de
   * l'accueil ni des pages métier.
   */
  const [entree, affaire, partage, relance, commission, analytique] = parcoursProduit.etapes;
  const ecranDe = (cle: (typeof parcoursProduit.etapes)[number]["cle"]) => {
    switch (cle) {
      case "entree":
        return <EcranFiche ecran={entree.ecran} />;
      case "affaire":
        return <EcranColonnes ecran={affaire.ecran} />;
      case "partage":
        return <EcranVaEtVient ecran={partage.ecran} />;
      case "relance":
        return <EcranApercu ecran={relance.ecran} />;
      case "commission":
        return <EcranCommission ecran={commission.ecran} />;
      case "analytique":
        return <EcranSerie ecran={analytique.ecran} />;
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

      {/* LE PARCOURS — six étapes dans l'ordre d'usage, un écran par étape,
          et entre chacune la phrase qui dit ce qui vient de se passer. */}
      {parcoursProduit.etapes.map((etape, rang) => (
        <SectionEditoriale
          key={etape.cle}
          numero={etape.numero}
          intitule={etape.intitule}
          titre={etape.titre}
          ton={rang % 2 === 1 ? "doux" : "normal"}
          largeurContenu={COLONNE}
        >
          <div className="grid grid-cols-12 items-start gap-x-6 gap-y-6">
            <div data-entree className="col-span-12 min-w-0 lg:col-span-5">
              <p className="mesure text-pretty leading-relaxed text-muted-foreground">{etape.texte}</p>
              {etape.liaison && (
                <p className="mesure mt-6 border-l border-border pl-6 text-sm leading-relaxed text-foreground">
                  {etape.liaison}
                </p>
              )}
            </div>
            <div data-entree data-rang={1} className="col-span-12 min-w-0 lg:col-start-7 lg:col-span-6">
              {ecranDe(etape.cle)}
              <p className="mesure mt-4 text-sm text-muted-foreground">{mentionEcrans}</p>
            </div>
          </div>
        </SectionEditoriale>
      ))}

      <SectionEditoriale
        intitule={produit.metiers.intitule}
        titre={produit.metiers.titre}
        chapo={produit.metiers.chapo}
        largeurContenu={COLONNE}
      >
        <ul className="grille-cartes" data-colonnes="3">
          {sousEntrees("produit").map((cle, rang) => (
            <li key={cle} data-entree data-rang={rang}>
              <a
                href={path(locale, cle)}
                className="block h-full rounded-xl border border-border bg-card p-6 text-card-foreground transition-colors duration-200 ease-out hover:border-primary"
              >
                <h3 className="text-xl font-bold tracking-tight text-foreground">{sansOrphelin(common.nav[cle])}</h3>
                <p className="mt-6 text-sm font-medium text-primary-ink underline underline-offset-4">
                  {common.actions.enSavoirPlus}
                </p>
              </a>
            </li>
          ))}
        </ul>
      </SectionEditoriale>

      <SectionEditoriale
        intitule={produit.perimetre.intitule}
        titre={produit.perimetre.titre}
        ton="doux"
        largeurContenu={COLONNE}
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

      <section className="border-t border-border py-24 sm:py-24 lg:py-36">
        <div className="editorial-conteneur">
          <div className="grid grid-cols-12 gap-x-6">
            <div
              data-entree
              className="col-span-12 rounded-xl border border-border bg-card px-6 py-12 sm:px-12 lg:col-start-4 lg:col-span-9"
            >
              <h2 className="text-balance text-titre-2 text-foreground">{sansOrphelin(produit.final.titre)}</h2>
              <p className="mesure mt-6 text-pretty text-chapo text-muted-foreground">{avecReservation(produit.final.texte, produit.final.texteReservation)}</p>
              <div className="mt-12">{appels}</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
