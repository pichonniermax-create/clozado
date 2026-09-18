import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionLink } from "@/components/action-link";
import { BandeRupture } from "@/components/bande-rupture";
import { EcranFunnel, EcranRegles, EcranSuivi, EcranTableauDeBord } from "@/components/ecran-produit";
import { EcransOnglets } from "@/components/ecrans-onglets";
import { Card, Puce } from "@/components/layout-primitives";
import { Mouvement } from "@/components/mouvement";
import { References } from "@/components/references";
import { SectionEditoriale } from "@/components/section-editoriale";
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
 * LA PAGE D'ACCUEIL — composée, plus posée au centre.
 *
 * Ce qui la tient depuis le 2026-09-18 : une grille de DOUZE colonnes où le
 * contenu est désaxé, des sections NUMÉROTÉES en chasse fixe et séparées par
 * un filet pleine largeur, un contraste d'échelle assumé (un numéro peut
 * atteindre 180 px quand le corps tient à 17 px), et des blocs de texte qui
 * ne dépassent jamais 65 caractères de ligne. Les chiffres sont en Geist
 * Mono, tabulaires : une colonne de nombres s'aligne, un compteur qui monte
 * ne pousse pas sa ligne.
 *
 * AUCUNE IMAGE N'EST AFFICHÉE ICI, ni sur aucune page du site. Quand une
 * section doit montrer le produit, elle en REDESSINE l'écran en HTML
 * (`components/ecran-produit.tsx`).
 *
 * LE MOUVEMENT est propre à cette page : un attribut posé sur `<html>` par
 * le script en tête de page arme le CSS, et `MiseEnMouvement` pose les
 * observateurs. Sans JavaScript, rien n'est masqué.
 *
 * Aucun texte n'est écrit ici : tout vient de `content/<langue>/accueil.ts`.
 */
export default async function Accueil(props: PageProps<"/[locale]">) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();
  const { common, accueil, ecrans, mentionEcrans } = getDictionary(locale);

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

  /** Les trois vues du premier écran, sous leurs onglets. */
  const vues = [
    { cle: "suivi", libelle: ecrans.onglets.suivi, contenu: <EcranSuivi ecran={ecrans.suivi} sansLegende /> },
    {
      cle: "tableau-de-bord",
      libelle: ecrans.onglets.tableauDeBord,
      contenu: <EcranTableauDeBord ecran={ecrans.tableauDeBord} sansLegende />,
    },
    { cle: "funnel", libelle: ecrans.onglets.funnel, contenu: <EcranFunnel ecran={ecrans.funnel} sansLegende /> },
  ];

  /** L'écran qui prouve une affirmation. Chaque preuve porte la clé du sien. */
  const ecranDe = (cle: (typeof accueil.preuves.elements)[number]["cle"]) => {
    switch (cle) {
      case "tableau-de-bord":
        return <EcranTableauDeBord ecran={ecrans.tableauDeBord} />;
      case "regles":
        return <EcranRegles ecran={ecrans.regles} />;
      case "funnel":
        return <EcranFunnel ecran={ecrans.funnel} />;
    }
  };

  return (
    <div className="editorial">
      <Mouvement />

      {/* PREMIER ÉCRAN — le propos sur sept colonnes, l'écran du produit sur
          cinq, et qui ROMPT LA MARGE : il file vers le bord droit au lieu de
          s'arrêter sur la gouttière. C'est ce débord qui sort la page de la
          composition centrée dès la première ligne. */}
      <section className="border-b border-border">
        <div className="editorial-conteneur py-14 sm:py-20 lg:py-24">
          <div className="grid grid-cols-12 gap-x-6 gap-y-12">
            <div data-entree className="col-span-12 min-w-0 lg:col-span-7">
              <h1 className="text-titre-1 text-foreground">{accueil.hero.titre}</h1>
              <p className="mesure mt-8 text-pretty text-chapo text-muted-foreground">{accueil.hero.chapo}</p>
              <p className="mesure mt-4 text-pretty text-chapo text-muted-foreground">{accueil.hero.precision}</p>
              <div className="mt-10">{appels}</div>
              <p className="mt-4 text-sm text-muted-foreground">{accueil.hero.note}</p>
            </div>

            <div
              data-entree
              data-rang={1}
              className="rompt-a-droite col-span-12 min-w-0 lg:col-start-8 lg:col-span-5"
            >
              <EcransOnglets vues={vues} libelleListe={ecrans.onglets.libelleListe} />
              <p className="mesure mt-4 text-sm text-muted-foreground">{mentionEcrans}</p>
            </div>
          </div>
        </div>
      </section>

      <SectionEditoriale
        numero="01"
        intitule={accueil.probleme.intitule}
        titre={accueil.probleme.titre}
        largeurContenu="lg:col-start-4 lg:col-span-9"
      >
        <ul className="grid gap-4 sm:grid-cols-3">
          {accueil.probleme.elements.map((element, rang) => (
            <li key={element.titre} data-entree data-rang={rang}>
              <Card className="h-full">
                <p className="tabulaire text-sm text-muted-foreground">{String(rang + 1).padStart(2, "0")}</p>
                <h3 className="mt-6 text-xl font-bold tracking-tight text-foreground">{element.titre}</h3>
                <p className="mesure mt-4 text-sm leading-relaxed text-muted-foreground">{element.texte}</p>
              </Card>
            </li>
          ))}
        </ul>
      </SectionEditoriale>

      {/* LES TROIS PREUVES — le propos et l'écran changent de côté à chaque
          fois, et l'écran occupe toujours plus de place que le texte. */}
      <SectionEditoriale
        numero="02"
        intitule={accueil.preuves.intitule}
        titre={accueil.preuves.titre}
        ton="doux"
        largeurContenu="lg:col-start-2 lg:col-span-11"
      >
        <div className="flex flex-col gap-20 lg:gap-32">
          {accueil.preuves.elements.map((preuve, index) => (
            <div key={preuve.cle} className="grid grid-cols-12 items-center gap-x-6 gap-y-8">
              <div
                data-entree
                className={
                  index % 2 === 1
                    ? "col-span-12 min-w-0 lg:order-2 lg:col-start-9 lg:col-span-4"
                    : "col-span-12 min-w-0 lg:col-span-4"
                }
              >
                <h3 className="text-balance text-titre-3 text-foreground">{preuve.titre}</h3>
                <p className="mesure mt-4 text-pretty leading-relaxed text-muted-foreground">{preuve.texte}</p>
                <ul className="mt-8 flex flex-col gap-4">
                  {preuve.points.map((point) => (
                    <li key={point} className="flex gap-4 text-sm leading-relaxed">
                      <Puce />
                      <span className="mesure text-muted-foreground">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div
                data-entree
                data-rang={1}
                className={
                  index % 2 === 1
                    ? "col-span-12 min-w-0 lg:order-1 lg:col-span-7"
                    : "col-span-12 min-w-0 lg:col-start-6 lg:col-span-7"
                }
              >
                {ecranDe(preuve.cle)}
              </div>
            </div>
          ))}
        </div>
      </SectionEditoriale>

      <BandeRupture titre={accueil.rupture.titre} elements={accueil.rupture.elements} />

      <SectionEditoriale
        numero="03"
        intitule={accueil.reste.intitule}
        titre={accueil.reste.titre}
        largeurContenu="lg:col-start-4 lg:col-span-9"
      >
        <ul className="grid gap-4 sm:grid-cols-3">
          {accueil.reste.elements.map((element, rang) => (
            <li key={element.titre} data-entree data-rang={rang}>
              <Card className="h-full">
                <h3 className="text-xl font-bold tracking-tight text-foreground">{element.titre}</h3>
                <p className="mesure mt-4 text-sm leading-relaxed text-muted-foreground">{element.texte}</p>
              </Card>
            </li>
          ))}
        </ul>
      </SectionEditoriale>

      <SectionEditoriale
        numero="04"
        intitule={accueil.pourQui.intitule}
        titre={accueil.pourQui.titre}
        chapo={accueil.pourQui.chapo}
        ton="doux"
        largeurContenu="lg:col-start-4 lg:col-span-9"
      >
        <ul className="grid gap-4 sm:grid-cols-3">
          {accueil.pourQui.elements.map((element, rang) => {
            const corps = (
              <>
                <h3 className="text-xl font-bold tracking-tight text-foreground">{element.titre}</h3>
                <p className="mesure mt-4 text-sm leading-relaxed text-muted-foreground">{element.texte}</p>
              </>
            );
            // La carte n'est cliquable que si sa page existe : le site n'a jamais de lien mort.
            return (
              <li key={element.cle} data-entree data-rang={rang}>
                {ROUTES[element.cle].built ? (
                  <Link
                    href={path(locale, element.cle)}
                    className="block h-full rounded-xl border border-border bg-card p-6 text-card-foreground transition-colors duration-200 ease-out hover:border-primary"
                  >
                    {corps}
                    <p className="mt-6 text-sm font-medium text-primary-ink underline underline-offset-4">
                      {common.actions.enSavoirPlus}
                    </p>
                  </Link>
                ) : (
                  <Card className="h-full">{corps}</Card>
                )}
              </li>
            );
          })}
        </ul>
      </SectionEditoriale>

      <SectionEditoriale
        numero="05"
        intitule={accueil.conformite.intitule}
        titre={accueil.conformite.titre}
        chapo={accueil.conformite.chapo}
        largeurContenu="lg:col-start-4 lg:col-span-8"
      >
        <dl className="grid gap-x-12 gap-y-10 sm:grid-cols-2">
          {accueil.conformite.elements.map((element, rang) => (
            <div key={element.titre} data-entree data-rang={rang}>
              <dt className="font-semibold text-foreground">{element.titre}</dt>
              <dd className="mesure mt-2 text-sm leading-relaxed text-muted-foreground">{element.texte}</dd>
            </div>
          ))}
        </dl>
      </SectionEditoriale>

      <SectionEditoriale
        numero="06"
        intitule={accueil.perimetre.intitule}
        titre={accueil.perimetre.titre}
        ton="doux"
        largeurContenu="lg:col-start-4 lg:col-span-6"
      >
        <ul className="flex flex-col gap-4">
          {accueil.perimetre.elements.map((element, rang) => (
            <li key={element} data-entree data-rang={rang} className="flex gap-4 leading-relaxed">
              <Puce />
              <span className="mesure text-muted-foreground">{element}</span>
            </li>
          ))}
        </ul>
      </SectionEditoriale>

      <References locale={locale} />

      <section className="border-t border-border py-20 sm:py-28 lg:py-36">
        <div className="editorial-conteneur">
          <div className="grid grid-cols-12 gap-x-6">
            <div
              data-entree
              className="col-span-12 rounded-xl border border-border bg-card px-6 py-16 sm:px-12 lg:col-start-3 lg:col-span-10"
            >
              <h2 className="text-balance text-titre-2 text-foreground">{accueil.final.titre}</h2>
              <p className="mesure mt-6 text-pretty text-chapo text-muted-foreground">{accueil.final.texte}</p>
              <div className="mt-10">{appels}</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
