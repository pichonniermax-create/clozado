import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageMetier } from "@/components/metier-page";
import { getDictionary, isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";

export async function generateMetadata(props: PageProps<"/[locale]/courtiers">): Promise<Metadata> {
  const { locale } = await props.params;
  if (!isLocale(locale)) return {};
  const { courtiers } = getDictionary(locale);
  return pageMetadata({ locale, route: "courtiers", titre: courtiers.meta.titre, description: courtiers.meta.description });
}

export default async function Page(props: PageProps<"/[locale]/courtiers">) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();
  return <PageMetier locale={locale} contenu={getDictionary(locale).courtiers} />;
}
