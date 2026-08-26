import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { pickClientMessages } from "@/i18n/messages";
import "./globals.css";
import { PRODUCT_NAME } from "@/lib/brand";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shell.root");
  return {
    title: PRODUCT_NAME,
    description: t("description"),
  // Le favicon du produit, déclaré ici plutôt que par un fichier
  // `app/favicon.ico` : un fichier à cet emplacement est TOUJOURS ajouté en
  // tête des icônes, même quand une coquille en pose une autre — deux
  // icônes concurrentes, et c'est le navigateur qui choisit. Déclarée par
  // métadonnées, l'icône d'une organisation la REMPLACE (fusion clé par
  // clé, chantier marque blanche). Le fichier vit dans public/, à la même
  // adresse, pour les navigateurs qui le demandent d'office.
    icons: { icon: [{ url: "/favicon.ico", sizes: "any" }] },
  };
}

/**
 * La langue de la page (`<html lang>`) et les messages des composants
 * client viennent de la configuration de requête (src/i18n/request.ts) :
 * celle de la personne connectée, sinon le français. Le fournisseur ne
 * sérialise que les namespaces dont les composants client ont besoin.
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider messages={pickClientMessages(messages)}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
