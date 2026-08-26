"use client";

import "./globals.css";

/**
 * Dernier filet : la mise en page racine elle-même n'a pas pu se rendre.
 * Ce fichier la remplace entièrement, d'où ses propres <html> et <body>,
 * la feuille de style importée à la main, et un rendu volontairement
 * simple — si on arrive ici, le moins de dépendances possible.
 */
export default function GlobalError({ retry }: { error: Error; retry: () => void }) {
  return (
    <html lang="fr">
      <body className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground antialiased">
        <main className="flex max-w-md flex-col items-center gap-4 rounded-xl border border-dashed border-border px-6 py-16 text-center">
          <p className="text-sm font-medium">La page n&apos;a pas pu s&apos;afficher.</p>
          <p className="text-sm text-muted-foreground">
            C&apos;est en général passager et ça ne vient pas de toi. Réessaie — si ça persiste,
            reviens dans quelques minutes.
          </p>
          <button
            type="button"
            onClick={retry}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-accent"
          >
            Réessayer
          </button>
        </main>
      </body>
    </html>
  );
}
