import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleCorps } from "@/components/article-corps";
import { ArticleVoisins } from "@/components/article-voisins";
import { FilAriane } from "@/components/fil-ariane";
import { Mouvement } from "@/components/mouvement";
import { Sommaire } from "@/components/sommaire";
import { articleParSlug, articles, dateLongue, slugCategorie, voisins } from "@/lib/articles";
import { getDictionary, isLocale, LOCALES } from "@/lib/i18n";
import { balisageArticle, balisageFilAriane, metadataBlog } from "@/lib/metadata";
import { path } from "@/lib/routes";
import { classeTitre, sansOrphelin } from "@/lib/titres";

export const dynamicParams = false;

/** Seuls les articles RÉELLEMENT présents dans le dépôt ont une page. */
export function generateStaticParams() {
  return LOCALES.flatMap((locale) => articles().map((article) => ({ locale, slug: article.slug })));
}

/** Dès six titres, un article mérite son sommaire. */
const SEUIL_SOMMAIRE = 6;

export async function generateMetadata(props: PageProps<"/[locale]/blog/[slug]">): Promise<Metadata> {
  const { locale, slug } = await props.params;
  const article = articleParSlug(slug);
  if (!article || !isLocale(locale)) return {};
  return metadataBlog({
    locale,
    chemin: `${path(locale, "blog")}/${article.slug}`,
    titre: article.titre,
    description: article.resume,
    article: { publie: article.publie, misAJour: article.misAJour, categorie: article.categorie },
  });
}

/**
 * /fr/blog/<article> — LA PAGE D'UN ARTICLE.
 *
 * Fil d'Ariane, dates de publication et de mise à jour, temps de lecture
 * calculé, sommaire ancré au-delà de six titres, corps rendu depuis des
 * blocs typés, voisins en bas, et deux balisages — `Article` et
 * `BreadcrumbList` — construits depuis les MÊMES données que ce qui
 * s'affiche, pour qu'ils ne puissent pas diverger.
 */
export default async function Article(props: PageProps<"/[locale]/blog/[slug]">) {
  const { locale, slug } = await props.params;
  const article = articleParSlug(slug);
  if (!article || !isLocale(locale)) notFound();
  const { blog } = getDictionary(locale);
  const base = path(locale, "blog");
  const { precedent, suivant } = voisins(slug);
  const avecSommaire = article.titres.length >= SEUIL_SOMMAIRE;

  const maillons = [
    { libelle: blog.filAriane.accueil, href: path(locale, "accueil") },
    { libelle: blog.meta.titre, href: base },
    { libelle: article.categorie, href: `${base}/categorie/${slugCategorie(article.categorie)}` },
    { libelle: article.titre },
  ];

  const balisage = [balisageArticle(locale, article), balisageFilAriane(locale, maillons)];

  return (
    <div className="editorial">
      <Mouvement />

      <section className="border-b border-border">
        <div className="editorial-conteneur py-12 sm:py-14 lg:py-12">
          <div className="grid grid-cols-12 gap-x-6">
            <div data-entree className="col-span-12 lg:col-start-4 lg:col-span-8">
              <FilAriane maillons={maillons} aide={blog.filAriane.aide} />
              <h1 className={`mt-6 ${classeTitre(article.titre)} text-foreground`}>{sansOrphelin(article.titre)}</h1>
              <p className="mesure mt-6 text-pretty text-chapo text-muted-foreground">{article.resume}</p>
              <p className="tabulaire mt-6 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span>
                  {blog.article.publieLe} <time dateTime={article.publie}>{dateLongue(article.publie)}</time>
                </span>
                {article.misAJour && article.misAJour !== article.publie && (
                  <span>
                    · {blog.article.misAJourLe}{" "}
                    <time dateTime={article.misAJour}>{dateLongue(article.misAJour)}</time>
                  </span>
                )}
                <span>
                  · {article.minutes} {blog.article.lecture}
                </span>
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-20 lg:py-24">
        <div className="editorial-conteneur">
          <div className="grid grid-cols-12 gap-x-6 gap-y-12">
            {avecSommaire && (
              <div className="order-2 col-span-12 lg:order-1 lg:col-start-1 lg:col-span-3">
                <Sommaire titres={article.titres} titre={blog.article.sommaireTitre} aide={blog.article.sommaireAide} />
              </div>
            )}
            <article
              className={
                avecSommaire
                  ? "order-1 col-span-12 min-w-0 lg:order-2 lg:col-start-4 lg:col-span-8"
                  : "col-span-12 min-w-0 lg:col-start-4 lg:col-span-8"
              }
            >
              {article.demonstration && (
                <aside className="mb-12 rounded-xl border border-border bg-muted px-6 py-5">
                  <p className="label">{blog.demonstration.titre}</p>
                  <p className="mesure mt-3 text-sm leading-relaxed text-foreground">{blog.demonstration.texte}</p>
                </aside>
              )}
              <ArticleCorps blocs={article.blocs} />
              <div className="mt-16">
                <ArticleVoisins
                  precedent={precedent ? { titre: precedent.titre, href: `${base}/${precedent.slug}` } : undefined}
                  suivant={suivant ? { titre: suivant.titre, href: `${base}/${suivant.slug}` } : undefined}
                  libelles={{
                    precedent: blog.article.precedent,
                    suivant: blog.article.suivant,
                    aide: blog.article.voisinsAide,
                  }}
                />
              </div>
            </article>
          </div>
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(balisage).replace(/</g, "\\u003c") }}
      />
    </div>
  );
}
