import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Mouvement } from "@/components/mouvement";
import { getDictionary, HTML_LANG, isLocale, LOCALES } from "@/lib/i18n";
import { path, url } from "@/lib/routes";
import { SITE_CONFIG } from "@/lib/site-config";
import { sansOrphelin } from "@/lib/titres";

/**
 * /fr/blog/<article> — LA PAGE D'UN ARTICLE, prête et sans article.
 *
 * `generateStaticParams` ne rend que les articles RÉELLEMENT publiés
 * (`blog.articles`, vide au lancement) et `dynamicParams` est fermé : une
 * adresse inventée ne rend pas une page à moitié écrite, elle rend 404.
 * Le jour où un article existe, sa page se construit sans rien toucher ici.
 */
export function generateStaticParams() {
  return LOCALES.flatMap((locale) =>
    getDictionary(locale).blog.articles.map((article) => ({ locale, slug: article.slug }))
  );
}

export const dynamicParams = false;

function trouve(locale: string, slug: string) {
  if (!isLocale(locale)) return null;
  return getDictionary(locale).blog.articles.find((article) => article.slug === slug) ?? null;
}

export async function generateMetadata(props: PageProps<"/[locale]/blog/[slug]">): Promise<Metadata> {
  const { locale, slug } = await props.params;
  const article = trouve(locale, slug);
  if (!article || !isLocale(locale)) return {};
  const { common } = getDictionary(locale);
  return {
    metadataBase: new URL(SITE_CONFIG.origin),
    title: { absolute: common.meta.gabaritDeTitre.replace("%s", article.titre) },
    description: article.resume,
    alternates: { canonical: `${url(locale, "blog")}/${article.slug}` },
    openGraph: { type: "article", title: article.titre, description: article.resume, publishedTime: article.date },
  };
}

export default async function Article(props: PageProps<"/[locale]/blog/[slug]">) {
  const { locale, slug } = await props.params;
  const article = trouve(locale, slug);
  if (!article || !isLocale(locale)) notFound();
  const { blog } = getDictionary(locale);

  const balisage = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: article.titre,
    description: article.resume,
    datePublished: article.date,
    inLanguage: HTML_LANG[locale],
    url: `${url(locale, "blog")}/${article.slug}`,
    isPartOf: { "@id": `${url(locale, "blog")}#blog` },
    publisher: { "@id": `${SITE_CONFIG.origin}/#organisation` },
  };

  return (
    <div className="editorial">
      <Mouvement />
      <article className="border-b border-border">
        <div className="editorial-conteneur py-14 sm:py-20 lg:py-24">
          <div className="grid grid-cols-12 gap-x-6">
            <div data-entree className="col-span-12 min-w-0 lg:col-start-3 lg:col-span-8">
              <Link href={path(locale, "blog")} className="label hover:text-foreground">
                {blog.article.retour}
              </Link>
              <h1 className="mt-6 text-titre-1 text-foreground">{sansOrphelin(article.titre)}</h1>
              <p className="tabulaire mt-6 text-sm text-muted-foreground">
                {article.date} · {article.minutes} {blog.article.lectureMinutes}
              </p>
              <div className="mt-12 flex flex-col gap-6">
                {article.corps.map((paragraphe) => (
                  <p key={paragraphe} className="mesure leading-relaxed text-muted-foreground">
                    {paragraphe}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </article>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(balisage).replace(/</g, "\\u003c") }}
      />
    </div>
  );
}
