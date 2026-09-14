import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { FormatsProvider } from "@/components/i18n/formats-provider";
import { Toaster } from "@/components/ui/toast";
import { resolveRequestSettings } from "@/i18n/locale";
import { pickClientMessages } from "@/i18n/messages";
import "./globals.css";
import { PRODUCT_NAME } from "@/lib/brand";
import { parseTheme, SYSTEM_THEME_SCRIPT, THEME_COOKIE } from "@/lib/theme";
import { cn } from "@/lib/utils";

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
 *
 * Le thème (chantier UI/UX, src/lib/theme.ts) : la classe `dark` est posée
 * ici, côté serveur, d'après le cookie — aucun clignotement ; « système »
 * délègue à un script d'une ligne exécuté avant la première peinture, d'où
 * `suppressHydrationWarning` sur `<html>` (la classe peut différer entre le
 * serveur et le navigateur, et c'est voulu). Les notifications (`Toaster`)
 * vivent ici, à la racine : les écrans publics comme la coquille en posent.
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [locale, messages, settings, cookieStore] = await Promise.all([getLocale(), getMessages(), resolveRequestSettings(), cookies()]);
  const theme = parseTheme(cookieStore.get(THEME_COOKIE)?.value);
  return (
    <html
      lang={locale}
      className={cn(geistSans.variable, geistMono.variable, "h-full antialiased", theme === "dark" && "dark")}
      suppressHydrationWarning
    >
      {theme === "system" && (
        <head>
          <script dangerouslySetInnerHTML={{ __html: SYSTEM_THEME_SCRIPT }} />
        </head>
      )}
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider messages={pickClientMessages(messages)}>
          <FormatsProvider settings={settings}>
            <Toaster>{children}</Toaster>
          </FormatsProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
