import type { Metadata } from "next";
import localFont from "next/font/local";
import { NotFoundContent } from "@/components/not-found-content";
import { DEFAULT_LOCALE, HTML_LANG } from "@/lib/i18n";
import { getDictionary } from "@/lib/i18n";
import "./globals.css";

/**
 * LA PAGE INTROUVABLE GLOBALE — celle que reçoit une adresse qui ne
 * correspond à AUCUNE route, pas même à une langue connue : « /offre-2 »,
 * « /wp-admin ». La coquille racine du site vit sous un segment dynamique
 * (`app/[locale]/layout.tsx`), donc aucune coquille ne peut l'envelopper :
 * c'est le cas exact que ce fichier existe pour couvrir. Il doit donc
 * rendre le document entier, et réimporter les styles et la police.
 *
 * Elle affiche le MÊME corps que la 404 d'une langue (`NotFoundContent`) :
 * un seul écrit, deux portes d'entrée.
 */
const geist = localFont({
  src: "./fonts/geist-latin.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-geist",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
  // eslint-disable-next-line local/no-visible-text -- un nom de famille de police, pas un texte lu dans une page
  adjustFontFallback: "Arial",
});

export const metadata: Metadata = {
  title: getDictionary(DEFAULT_LOCALE).common.introuvable.metaTitre,
  description: getDictionary(DEFAULT_LOCALE).common.introuvable.texte,
};

export default function GlobalNotFound() {
  return (
    <html lang={HTML_LANG[DEFAULT_LOCALE]} className={geist.variable}>
      <body className="flex min-h-dvh flex-col">
        <NotFoundContent locale={DEFAULT_LOCALE} />
      </body>
    </html>
  );
}
