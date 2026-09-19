import { articleParSlug, articles } from "@/lib/articles";
import { DEFAULT_LOCALE, getDictionary, isLocale, LOCALES } from "@/lib/i18n";
import { imagePartage, TAILLE_PARTAGE, TYPE_PARTAGE } from "@/lib/og";

/**
 * L'IMAGE DE PARTAGE D'UN ARTICLE — la sienne, avec son titre.
 *
 * Elle existe parce qu'une image posée sur `/blog` n'est PAS reprise par
 * `/blog/<article>` dès que celui-ci déclare son propre `openGraph` : les
 * articles partaient sans vignette, et leur carte retombait en « summary ».
 * La seule page du site faite pour être partagée était la seule à ne pas
 * savoir se montrer.
 */
export const size = TAILLE_PARTAGE;
export const contentType = TYPE_PARTAGE;
export const alt = getDictionary(DEFAULT_LOCALE).common.marque;

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => articles().map((article) => ({ locale, slug: article.slug })));
}

export default async function Image(props: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale: brut, slug } = await props.params;
  const locale = isLocale(brut) ? brut : DEFAULT_LOCALE;
  const article = articleParSlug(slug);
  if (!article) return imagePartage({ titre: getDictionary(locale).blog.meta.titre });
  return imagePartage({ titre: article.titre, surtitre: article.categorie });
}
