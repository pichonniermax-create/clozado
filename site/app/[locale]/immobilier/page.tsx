import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageMetier } from "@/components/metier-page";
import { getDictionary, isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";

export async function generateMetadata(props: PageProps<"/[locale]/immobilier">): Promise<Metadata> {
  const { locale } = await props.params;
  if (!isLocale(locale)) return {};
  const { immobilier } = getDictionary(locale);
  return pageMetadata({ locale, route: "immobilier", titre: immobilier.meta.titre, description: immobilier.meta.description });
}

export default async function Page(props: PageProps<"/[locale]/immobilier">) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();
  return <PageMetier locale={locale} contenu={getDictionary(locale).immobilier} />;
}
