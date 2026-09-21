import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageLegaleRendu } from "@/components/page-legale";
import { getDictionary, isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";

export async function generateMetadata(props: PageProps<"/[locale]/mentions-legales">): Promise<Metadata> {
  const { locale } = await props.params;
  if (!isLocale(locale)) return {};
  const contenu = getDictionary(locale).mentionsLegales;
  return pageMetadata({ locale, route: "mentionsLegales", titre: contenu.meta.titre, description: contenu.meta.description });
}

export default async function Page(props: PageProps<"/[locale]/mentions-legales">) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();
  return <PageLegaleRendu contenu={getDictionary(locale).mentionsLegales} page="mentions-legales" />;
}
