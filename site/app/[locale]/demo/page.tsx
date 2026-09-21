import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionLink } from "@/components/action-link";
import {ListeStructuree} from "@/components/layout-primitives";
import { Mouvement } from "@/components/mouvement";
import { SectionEditoriale } from "@/components/section-editoriale";
import { getDictionary, isLocale, type Locale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";
import { DEMO_URL, RESERVATION_EN_LIGNE, RESERVATION_URL } from "@/lib/site-config";
import { classeTitre, sansOrphelin } from "@/lib/titres";

export async function generateMetadata(props: PageProps<"/[locale]/demo">): Promise<Metadata> {
  const { locale } = await props.params;
  if (!isLocale(locale)) return {};
  const { demo } = getDictionary(locale);
  // Le titre et le résumé suivent le nombre de gestes réellement proposés.
  const meta = RESERVATION_EN_LIGNE ? demo.meta : demo.metaSeul;
  return pageMetadata({ locale, route: "demo", titre: meta.titre, description: meta.description });
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
      <p className="mt-4 text-pretty leading-relaxed text-foreground">{texte}</p>

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

export default async function Demo(props: PageProps<"/[locale]/demo">) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();
  const { demo } = getDictionary(locale);
  /* Un titre qui annonce « deux façons » au-dessus d'une seule carte est un
     texte faux, pas une approximation. La page prend celui qui correspond à
     ce qu'elle montre. */
  const hero = RESERVATION_EN_LIGNE ? demo.hero : demo.heroSeul;

  return (
    <div className="editorial">
      <Mouvement />

      <section className="border-b border-border">
        <div className="editorial-conteneur py-12 sm:py-12 lg:py-12">
          {/* La page Démonstration n'a pas d'écran de preuve : son premier
              écran est entièrement centré. */}
          <div data-entree className="colonne-lecture-centree">
            <h1 className={`${classeTitre(hero.titre)} text-foreground`}>{sansOrphelin(hero.titre)}</h1>
            <p className="mesure mt-6 text-pretty text-chapo text-foreground">{hero.chapo}</p>
          </div>

          <div className="corps-section mt-12">
            <div
              className="grille-cartes"
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
              {/* La seconde carte est celle du rendez-vous. Tant que la page
                  de réservation n'est pas en ligne, la page ne propose qu'un
                  geste — celui qui fonctionne. */}
              {RESERVATION_EN_LIGNE && (
                <Geste
                  locale={locale}
                  surtitre={demo.reserver.surtitre}
                  titre={demo.reserver.titre}
                  texte={demo.reserver.texte}
                  elementsTitre={demo.reserver.elementsTitre}
                  elements={demo.reserver.elements}
                  action={demo.reserver.action}
                  href={RESERVATION_URL}
                  variante="primaire"
                />
              )}
            </div>
          </div>
        </div>
      </section>

      <SectionEditoriale intitule={demo.limites.intitule} titre={demo.limites.titre}>
        <ListeStructuree elements={demo.limites.elements} colonnes={2} />
      </SectionEditoriale>

      {/* Cette section ne dit qu'une chose : « réservez plutôt un créneau ».
          Sans prise de rendez-vous, elle n'a rien à dire — on ne la garde pas
          en la vidant de son sens. */}
      {RESERVATION_EN_LIGNE && (
        <SectionEditoriale ton="doux">
          <div data-entree>
            <h2 className="text-balance text-titre-2 text-foreground">{sansOrphelin(demo.final.titre)}</h2>
            <p className="mesure mt-6 text-pretty text-chapo text-foreground">{demo.final.texte}</p>
          </div>
        </SectionEditoriale>
      )}
    </div>
  );
}
