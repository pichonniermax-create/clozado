"use client";

/* eslint-disable local/no-visible-text -- le dernier filet REMPLACE la mise en page racine, donc le fournisseur next-intl avec elle : ses trois phrases vivent ici, en français et en anglais (audit, constat Q3) */
import "./globals.css";
import { useEffect, useState } from "react";
import { reportError } from "@/lib/log";

/**
 * Dernier filet : la mise en page racine elle-même n'a pas pu se rendre.
 * Ce fichier la remplace entièrement, d'où ses propres <html> et <body>,
 * la feuille de style importée à la main, et un rendu volontairement
 * simple — si on arrive ici, le moins de dépendances possible. Surtout PAS
 * `useTranslations` : le fournisseur de messages vit dans la mise en page
 * qui vient de tomber ; l'appeler ici ferait tomber le filet lui-même, et
 * la personne verrait la page technique brute de Next.
 *
 * La langue : celle que portait le document avant l'erreur (`<html lang>`
 * posé par la mise en page racine), lue AU PREMIER RENDU — après, c'est
 * cette page qui l'écrit. Le français sinon.
 */
const TEXTS = {
  fr: {
    title: "La page n’a pas pu s’afficher.",
    body: "C’est en général passager et ça ne vient pas de toi. Réessaie — si ça persiste, reviens dans quelques minutes.",
    retry: "Réessayer",
  },
  en: {
    title: "The page couldn’t be displayed.",
    body: "This is usually temporary and not your doing. Try again — if it persists, come back in a few minutes.",
    retry: "Try again",
  },
} as const;

type Lang = keyof typeof TEXTS;

function documentLang(): Lang {
  if (typeof document === "undefined") return "fr";
  return document.documentElement.lang.toLowerCase().startsWith("en") ? "en" : "fr";
}

export default function GlobalError({ error, retry }: { error: Error; retry: () => void }) {
  const [lang] = useState<Lang>(documentLang);
  useEffect(() => {
    reportError(error, { boundary: "global" });
  }, [error]);
  const t = TEXTS[lang];
  return (
    <html lang={lang} suppressHydrationWarning>
      <body className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground antialiased">
        <main className="flex max-w-md flex-col items-center gap-4 rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <p className="text-sm font-medium">{t.title}</p>
          <p className="text-sm text-muted-foreground">{t.body}</p>
          <button
            type="button"
            onClick={retry}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            {t.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
