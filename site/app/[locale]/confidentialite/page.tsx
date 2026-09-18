import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageLegaleRendu } from "@/components/page-legale";
import { getDictionary, isLocale } from "@/lib/i18n";
import { pageMetadata } from "@/lib/metadata";

export async function generateMetadata(props: PageProps<"/[locale]/confidentialite">): Promise<Metadata> {
  const { locale } = await props.params;
  if (!isLocale(locale)) return {};
  const contenu = getDictionary(locale).confidentialite;
  return pageMetadata({ locale, route: "confidentialite", titre: contenu.meta.titre, description: contenu.meta.description });
}

export default async function Page(props: PageProps<"/[locale]/confidentialite">) {
  const { locale } = await props.params;
  if (!isLocale(locale)) notFound();
  return <PageLegaleRendu contenu={getDictionary(locale).confidentialite} />;
}
