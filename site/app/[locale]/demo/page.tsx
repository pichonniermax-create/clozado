import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionLink } from "@/components/action-link";
import { Puce } from "@/components/layout-primitives";
import { Mouvement } from "@/components/mouvement";
import { SectionEditoriale } from "@/components/section-editoriale";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";
import { DEMO_URL, SITE_CONFIG } from "@/lib/site-config";
import { classeTitre, sansOrphelin } from "@/lib/titres";

export async function generateMetadata(props: PageProps<"/[locale]/demo">): Promise<Metadata> {
  const { locale } = await props.params;
  if (!isLocale(locale)) return {};
  const { demo } = getDictionary(locale);
  return pageMetadata({ locale, route: "demo", titre: demo.meta.titre, description: demo.meta.description });
}

/** Une des deux cartes. Elles sont strictement symétriques : même hauteur, même structure, même poids visuel — aucun des deux gestes n'est présenté comme le bon. */
function Geste({
  surtitre,
  titre,
  texte,
  elementsTitre,
  elements,
  action,
  href,
  variante,
  locale,
}: {
  surtitre: string;
  titre: string;
  texte: string;
  elementsTitre: string;
  elements: readonly string[];
  action: string;
  href: string;
  variante: "primaire" | "secondaire";
  locale: Locale;
}) {
  const { common } = getDictionary(locale);
  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card p-6 text-card-foreground sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{surtitre}</p>
      <h2 className="mt-3 text-balance text-2xl font-semibold tracking-tight">{sansOrphelin(titre)}</h2>
      <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">{texte}</p>

      <h3 className="mt-6 text-sm font-semibold">{sansOrphelin(elementsTitre)}</h3>
      <ul className="mt-3 flex flex-1 flex-col gap-3">
        {elements.map((element) => (
          <li key={element} className="flex gap-3 text-sm leading-relaxed">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground" />
            <span className="text-muted-foreground">{element}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <ActionLink href={href} variante={variante} externe mentionNouvelOnglet={common.actions.nouvelOnglet}>
          {action}
        </ActionLink>
      </div>
    </div>
  );
}

/**
 * /fr/demo — DEUX GESTES SÉPARÉS, et rien entre eux : deux cartes de même
 * poids, côte à côte sur grand écran, l'une au-dessus de l'autre sur
 * mobile. Chacune dit ce qu'elle donne, ce qu'on y verra, et porte son
 * propre bouton. Aucun appel à l'action commun ne vient les brouiller.
 */
/** La colonne unique de la page — la même pour toutes ses sections. */
const COLONNE = "lg:col-start-4 lg:col-span-9";

export default async function Demo(props: PageProps<"/[locale]/demo">) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();
  const { demo } = getDictionary(locale);

  return (
    <div className="editorial">
      <Mouvement />

      <section className="border-b border-border">
        <div className="editorial-conteneur py-12 sm:py-12 lg:py-12">
          <div className="grid grid-cols-12 gap-x-6 gap-y-12">
            <div data-entree className={`col-span-12 ${COLONNE}`}>
              <h1 className={`${classeTitre(demo.hero.titre)} text-foreground`}>{sansOrphelin(demo.hero.titre)}</h1>
              <p className="mesure mt-6 text-pretty text-chapo text-muted-foreground">{demo.hero.chapo}</p>
            </div>

            <div
              className={`grille-cartes col-span-12 ${COLONNE}`}
              data-colonnes="2-lg"
              style={{ "--ecart": "1.5rem" } as React.CSSProperties}
            >
              <Geste
                locale={locale}
                surtitre={demo.ouvrir.surtitre}
                titre={demo.ouvrir.titre}
                texte={demo.ouvrir.texte}
                elementsTitre={demo.ouvrir.elementsTitre}
                elements={demo.ouvrir.elements}
                action={demo.ouvrir.action}
                href={DEMO_URL}
                variante="primaire"
              />
              <Geste
                locale={locale}
                surtitre={demo.reserver.surtitre}
                titre={demo.reserver.titre}
                texte={demo.reserver.texte}
                elementsTitre={demo.reserver.elementsTitre}
                elements={demo.reserver.elements}
                action={demo.reserver.action}
                href={SITE_CONFIG.bookingUrl}
                variante="primaire"
              />
            </div>
          </div>
        </div>
      </section>

      <SectionEditoriale numero="01" intitule={demo.limites.intitule} titre={demo.limites.titre} largeurContenu={COLONNE}>
        <ul className="flex flex-col gap-4">
          {demo.limites.elements.map((element, rang) => (
            <li key={element} data-entree data-rang={rang} className="flex gap-4 leading-relaxed">
              <Puce />
              <span className="mesure text-muted-foreground">{element}</span>
            </li>
          ))}
        </ul>
      </SectionEditoriale>

      <SectionEditoriale numero="02" ton="doux" largeurContenu={COLONNE}>
        <div data-entree>
          <h2 className="text-balance text-titre-2 text-foreground">{sansOrphelin(demo.final.titre)}</h2>
          <p className="mesure mt-6 text-pretty text-chapo text-muted-foreground">{demo.final.texte}</p>
        </div>
      </SectionEditoriale>
    </div>
  );
}
