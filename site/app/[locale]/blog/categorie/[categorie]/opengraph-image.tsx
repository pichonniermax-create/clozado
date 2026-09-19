import { categories } from "@/lib/articles";
import { DEFAULT_LOCALE, getDictionary, isLocale, LOCALES } from "@/lib/i18n";
import { imagePartage, TAILLE_PARTAGE, TYPE_PARTAGE } from "@/lib/og";

/** L'image de partage d'une catégorie — son nom, sous l'intitulé du blog. */
export const size = TAILLE_PARTAGE;
export const contentType = TYPE_PARTAGE;
export const alt = getDictionary(DEFAULT_LOCALE).blog.meta.titre;

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => categories().map(({ slug }) => ({ locale, categorie: slug })));
}

export default async function Image(props: { params: Promise<{ locale: string; categorie: string }> }) {
  const { locale: brut, categorie } = await props.params;
  const locale = isLocale(brut) ? brut : DEFAULT_LOCALE;
  const contenu = getDictionary(locale).blog;
  const trouvee = categories().find((c) => c.slug === categorie);
  return imagePartage({ titre: trouvee?.nom ?? contenu.meta.titre, surtitre: contenu.hero.surtitre });
}
