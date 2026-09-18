import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionLink } from "@/components/action-link";
import { HeroPage } from "@/components/hero-page";
import { Mouvement } from "@/components/mouvement";
import { SectionEditoriale } from "@/components/section-editoriale";
import { getDictionary, isLocale, HTML_LANG } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";
import { path, url } from "@/lib/routes";
import { SITE_CONFIG } from "@/lib/site-config";

export async function generateMetadata(props: PageProps<"/[locale]/blog">): Promise<Metadata> {
  const { locale } = await props.params;
  if (!isLocale(locale)) return {};
  const { blog } = getDictionary(locale);
  return pageMetadata({ locale, route: "blog", titre: blog.meta.titre, description: blog.meta.description });
}

/**
 * /fr/blog — L'INDEX. Il est VIDE au lancement, et il le dit : aucun
 * article n'est inventé pour faire nombre.
 *
 * La structure, elle, est entière — la liste, la page d'un article
 * (`blog/[slug]`), et le balisage `Blog`. Le jour où un article est écrit,
 * il s'ajoute à `blog.articles` et tout se remplit : aucune ligne à
 * toucher ici. Le balisage ne déclare que les articles réellement publiés.
 */
export default async function Blog(props: PageProps<"/[locale]/blog">) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();
  const { common, blog } = getDictionary(locale);

  const balisage = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "@id": `${url(locale, "blog")}#blog`,
    name: blog.meta.titre,
    description: blog.meta.description,
    inLanguage: HTML_LANG[locale],
    url: url(locale, "blog"),
    publisher: { "@id": `${SITE_CONFIG.origin}/#organisation` },
    blogPost: blog.articles.map((article) => ({
      "@type": "BlogPosting",
      headline: article.titre,
      description: article.resume,
      datePublished: article.date,
      url: `${url(locale, "blog")}/${article.slug}`,
    })),
  };

  return (
    <div className="editorial">
      <Mouvement />

      <HeroPage surtitre={blog.hero.surtitre} titre={blog.hero.titre} chapo={blog.hero.chapo} />

      <SectionEditoriale numero="01" largeurContenu="lg:col-start-4 lg:col-span-8">
        {blog.articles.length === 0 ? (
          <div data-entree>
            <h2 className="text-titre-2 text-foreground">{blog.vide.titre}</h2>
            <p className="mesure mt-6 text-pretty text-chapo text-muted-foreground">{blog.vide.texte}</p>
            <div className="mt-10">
              <ActionLink href={path(locale, "produit")}>{blog.vide.action}</ActionLink>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {blog.articles.map((article, rang) => (
              <li key={article.slug} data-entree data-rang={rang}>
                <Link href={`${path(locale, "blog")}/${article.slug}`} className="group block py-8">
                  <p className="tabulaire text-sm text-muted-foreground">
                    {article.date} · {article.minutes} {blog.article.lectureMinutes}
                  </p>
                  <h2 className="mt-4 text-titre-3 text-foreground group-hover:text-primary-ink">{article.titre}</h2>
                  <p className="mesure mt-3 leading-relaxed text-muted-foreground">{article.resume}</p>
                  <p className="mt-4 text-sm font-medium text-primary-ink underline underline-offset-4">
                    {common.actions.enSavoirPlus}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionEditoriale>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(balisage).replace(/</g, "\\u003c") }}
      />
    </div>
  );
}
