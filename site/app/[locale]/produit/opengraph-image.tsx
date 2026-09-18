import { DEFAULT_LOCALE, getDictionary, isLocale, LOCALES } from "@/lib/i18n";
import { imagePartage, TAILLE_PARTAGE, TYPE_PARTAGE } from "@/lib/og";

export const size = TAILLE_PARTAGE;
export const contentType = TYPE_PARTAGE;
export const alt = getDictionary(DEFAULT_LOCALE).produit.meta.titre;

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function Image(props: { params: Promise<{ locale: string }> }) {
  const { locale: brut } = await props.params;
  const locale = isLocale(brut) ? brut : DEFAULT_LOCALE;
  const contenu = getDictionary(locale).produit;
  return imagePartage({ titre: contenu.hero.titre, surtitre: contenu.hero.surtitre });
}
