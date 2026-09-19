import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogIndex } from "@/components/blog-index";
import { HeroPage } from "@/components/hero-page";
import { Mouvement } from "@/components/mouvement";
import { articles, nombreDePages, pageDArticles } from "@/lib/articles";
import { getDictionary, isLocale, LOCALES } from "@/lib/i18n";
import { path, url } from "@/lib/routes";
import { SITE_CONFIG } from "@/lib/site-config";

export const revalidate = 86400;
export const dynamicParams = false;

/** Les pages 2 et suivantes, et elles seules : la page 1 est l'index. */
export function generateStaticParams() {
  const pages = nombreDePages();
  return LOCALES.flatMap((locale) =>
    Array.from({ length: Math.max(0, pages - 1) }, (_, i) => ({ locale, numero: String(i + 2) }))
  );
}

export async function generateMetadata(props: PageProps<"/[locale]/blog/page/[numero]">): Promise<Metadata> {
  const { locale, numero } = await props.params;
  if (!isLocale(locale)) return {};
  const { blog, common } = getDictionary(locale);
  const titre = blog.meta.titrePage.replace("{numero}", numero);
  return {
    metadataBase: new URL(SITE_CONFIG.origin),
    title: { absolute: common.meta.gabaritDeTitre.replace("%s", titre) },
    description: blog.meta.description,
    alternates: { canonical: `${url(locale, "blog")}/page/${numero}` },
    robots: { index: false, follow: true },
  };
}

export default async function BlogPagine(props: PageProps<"/[locale]/blog/page/[numero]">) {
  const { locale, numero } = await props.params;
  const page = Number(numero);
  if (!isLocale(locale) || !Number.isInteger(page) || page < 2) notFound();
  const tous = articles();
  const pages = nombreDePages(tous.length);
  if (page > pages) notFound();
  const { blog } = getDictionary(locale);
  const base = path(locale, "blog");

  return (
    <div className="editorial">
      <Mouvement />
      <HeroPage surtitre={blog.hero.surtitre} titre={blog.hero.titre} chapo={blog.hero.chapo} />
      <BlogIndex
        locale={locale}
        articlesDeLaPage={pageDArticles(page, tous)}
        page={page}
        pages={pages}
        lien={(n) => (n === 1 ? base : `${base}/page/${n}`)}
      />
    </div>
  );
}
