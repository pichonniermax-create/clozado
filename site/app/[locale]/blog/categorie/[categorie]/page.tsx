import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogIndex } from "@/components/blog-index";
import { FilAriane } from "@/components/fil-ariane";
import { Mouvement } from "@/components/mouvement";
import { articlesDeCategorie, categories, nombreDePages, pageDArticles } from "@/lib/articles";
import { getDictionary, isLocale, LOCALES } from "@/lib/i18n";
import { balisageFilAriane, metadataBlog } from "@/lib/metadata";
import { path } from "@/lib/routes";
import { classeTitre, sansOrphelin } from "@/lib/titres";

export const dynamicParams = false;

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => categories().map(({ slug }) => ({ locale, categorie: slug })));
}

export async function generateMetadata(props: PageProps<"/[locale]/blog/categorie/[categorie]">): Promise<Metadata> {
  const { locale, categorie } = await props.params;
  if (!isLocale(locale)) return {};
  const trouvee = categories().find((c) => c.slug === categorie);
  if (!trouvee) return {};
  const { blog } = getDictionary(locale);
  return metadataBlog({
    locale,
    chemin: `${path(locale, "blog")}/categorie/${categorie}`,
    titre: blog.meta.titreCategorie.replace("{nom}", trouvee.nom),
    description: blog.meta.descriptionCategorie.replace("{nom}", trouvee.nom),
  });
}

/**
 * /fr/blog/categorie/<slug> — les articles d'une catégorie.
 *
 * Les catégories ne sont pas déclarées quelque part : elles sont celles que
 * les articles portent. Une catégorie sans article n'a donc pas de page,
 * et aucun lien ne mène nulle part.
 */
export default async function Categorie(props: PageProps<"/[locale]/blog/categorie/[categorie]">) {
  const { locale, categorie } = await props.params;
  if (!isLocale(locale)) notFound();
  const trouvee = categories().find((c) => c.slug === categorie);
  if (!trouvee) notFound();
  const { blog } = getDictionary(locale);
  const liste = articlesDeCategorie(categorie);
  const base = path(locale, "blog");

  const maillons = [
    { libelle: blog.filAriane.accueil, href: path(locale, "accueil") },
    { libelle: blog.meta.titre, href: base },
    { libelle: trouvee.nom },
  ];

  const balisage = balisageFilAriane(locale, maillons);

  return (
    <div className="editorial">
      <Mouvement />

      <section className="border-b border-border">
        <div className="editorial-conteneur py-12 sm:py-14 lg:py-12">
          <div className="grid grid-cols-12 gap-x-6">
            <div data-entree className="col-span-12 lg:col-start-4 lg:col-span-9">
              <FilAriane maillons={maillons} aide={blog.filAriane.aide} />
              <h1 className={`mt-6 ${classeTitre(trouvee.nom)} text-foreground`}>{sansOrphelin(trouvee.nom)}</h1>
              <p className="tabulaire mt-4 text-sm text-muted-foreground">
                {trouvee.compte} {trouvee.compte > 1 ? blog.liste.comptePlusieurs : blog.liste.compteUn}
              </p>
            </div>
          </div>
        </div>
      </section>

      <BlogIndex
        locale={locale}
        articlesDeLaPage={pageDArticles(1, liste)}
        page={1}
        pages={nombreDePages(liste.length)}
        lien={() => `${base}/categorie/${categorie}`}
        categorieCourante={categorie}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(balisage).replace(/</g, "\\u003c") }}
      />
    </div>
  );
}
