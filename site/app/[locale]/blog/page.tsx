import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogIndex } from "@/components/blog-index";
import { HeroPage } from "@/components/hero-page";
import { Mouvement } from "@/components/mouvement";
import { articles, nombreDePages, pageDArticles } from "@/lib/articles";
import { getDictionary, isLocale } from "@/lib/i18n";
import { balisageBlog, pageMetadata } from "@/lib/metadata";
import { path, url } from "@/lib/routes";

/** Les pages du blog sont statiques, et se revérifient une fois par jour. */
export const revalidate = 86400;

export async function generateMetadata(props: PageProps<"/[locale]/blog">): Promise<Metadata> {
  const { locale } = await props.params;
  if (!isLocale(locale)) return {};
  const { blog } = getDictionary(locale);
  const base = pageMetadata({ locale, route: "blog", titre: blog.meta.titre, description: blog.meta.description });
  return {
    ...base,
    alternates: {
      ...base.alternates,
      types: { "application/rss+xml": `${url(locale, "blog")}/rss.xml` },
    },
  };
}

/**
 * /fr/blog — L'INDEX, paginé, avec ses catégories et son flux.
 *
 * Les articles viennent de `content/articles/*.md`, lus au build. La page
 * n'invente rien : s'il n'y a aucun fichier, elle le dit.
 */
export default async function Blog(props: PageProps<"/[locale]/blog">) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();
  const { blog } = getDictionary(locale);
  const tous = articles();
  const base = path(locale, "blog");

  const balisage = balisageBlog(locale);

  return (
    <div className="editorial">
      <Mouvement />
      <HeroPage surtitre={blog.hero.surtitre} titre={blog.hero.titre} chapo={blog.hero.chapo} />
      <BlogIndex
        locale={locale}
        articlesDeLaPage={pageDArticles(1, tous)}
        page={1}
        pages={nombreDePages(tous.length)}
        lien={(numero) => (numero === 1 ? base : `${base}/page/${numero}`)}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(balisage).replace(/</g, "\\u003c") }}
      />
    </div>
  );
}
