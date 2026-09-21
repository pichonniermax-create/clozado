import { CarteArticle } from "@/components/carte-article";
import { PaginationBlog } from "@/components/pagination-blog";
import { SectionEditoriale } from "@/components/section-editoriale";
import { type Article, categories, dateLongue, slugCategorie } from "@/lib/articles";
import { getDictionary, type Locale } from "@/lib/i18n";
import { path } from "@/lib/routes";
import { cn } from "@/lib/cn";

/**
 * LA LISTE D'ARTICLES — la même pour l'index, ses pages suivantes et les
 * catégories. Une seule mise en page, donc aucune divergence entre trois
 * écrans qui montrent la même chose.
 */
export function BlogIndex({
  locale,
  articlesDeLaPage,
  page,
  pages,
  lien,
  categorieCourante,
}: {
  locale: Locale;
  articlesDeLaPage: readonly Article[];
  page: number;
  pages: number;
  lien: (numero: number) => string;
  /** Le slug de la catégorie affichée, si l'on est sur sa page. */
  categorieCourante?: string;
}) {
  const { blog } = getDictionary(locale);
  const base = path(locale, "blog");
  const toutes = categories();

  return (
    <SectionEditoriale intitule={blog.liste.intitule} largeurContenu="lg:col-start-4 lg:col-span-9">
      <div className="grid grid-cols-12 gap-x-6 gap-y-10">
        <div data-entree className="col-span-12 min-w-0 lg:col-span-8">
          {articlesDeLaPage.length === 0 ? (
            <div>
              <h2 className="text-titre-2 text-foreground">{blog.vide.titre}</h2>
              <p className="mesure mt-6 text-pretty text-chapo text-muted-foreground">{blog.vide.texte}</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {articlesDeLaPage.map((article) => (
                <CarteArticle
                  key={article.slug}
                  href={`${base}/${article.slug}`}
                  titre={article.titre}
                  resume={article.resume}
                  categorie={article.categorie}
                  categorieHref={`${base}/categorie/${slugCategorie(article.categorie)}`}
                  date={dateLongue(article.publie)}
                  dateISO={article.publie}
                  minutes={article.minutes}
                  lecture={blog.article.lecture}
                  demonstration={article.demonstration}
                  libelleDemonstration={blog.demonstration.titre}
                />
              ))}
              {pages > 1 && (
                <div className="mt-8">
                  <PaginationBlog page={page} pages={pages} lien={lien} libelles={blog.pagination} />
                </div>
              )}
            </div>
          )}
        </div>

        {toutes.length > 0 && (
          <aside data-entree data-rang={1} className="col-span-12 min-w-0 lg:col-start-10 lg:col-span-3">
            <p className="label">{blog.liste.categoriesTitre}</p>
            <ul className="mt-6 flex flex-col gap-3 border-l border-border">
              <li>
                <a
                  href={base}
                  aria-current={categorieCourante ? undefined : "true"}
                  className={cn(
                    "-ml-px flex min-h-6 items-center border-l pl-4 text-sm transition-colors duration-200 ease-out",
                    categorieCourante
                      ? "border-transparent text-muted-foreground hover:text-foreground"
                      : "border-primary font-medium text-foreground"
                  )}
                >
                  {blog.liste.toutes}
                </a>
              </li>
              {toutes.map((categorie) => (
                <li key={categorie.slug}>
                  <a
                    href={`${base}/categorie/${categorie.slug}`}
                    aria-current={categorieCourante === categorie.slug ? "true" : undefined}
                    className={cn(
                      "-ml-px flex min-h-6 items-center border-l pl-4 text-sm transition-colors duration-200 ease-out",
                      categorieCourante === categorie.slug
                        ? "border-primary font-medium text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {categorie.nom}{" "}
                    <span className="tabulaire text-detail text-muted-foreground">{categorie.compte}</span>
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-8">
              <a
                href={`${base}/rss.xml`}
                className="inline-flex min-h-6 items-center text-sm font-medium text-primary-ink underline underline-offset-4"
                title={blog.liste.fluxAide}
              >
                {blog.liste.fluxTitre}
              </a>
            </p>
          </aside>
        )}
      </div>
    </SectionEditoriale>
  );
}
