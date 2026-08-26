import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Clozado",
  description: "Suite d'outils d'assistance marketing multi-clients.",
  // Le favicon du produit, déclaré ici plutôt que par un fichier
  // `app/favicon.ico` : un fichier à cet emplacement est TOUJOURS ajouté en
  // tête des icônes, même quand une coquille en pose une autre — deux
  // icônes concurrentes, et c'est le navigateur qui choisit. Déclarée par
  // métadonnées, l'icône d'une organisation la REMPLACE (fusion clé par
  // clé, chantier marque blanche). Le fichier vit dans public/, à la même
  // adresse, pour les navigateurs qui le demandent d'office.
  icons: { icon: [{ url: "/favicon.ico", sizes: "any" }] },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
