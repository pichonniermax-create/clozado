"use client";

import { ErrorState } from "@/components/ui/error-state";

/** Erreur sur un écran public (accueil, connexion, inscription) — jamais l'écran technique brut. */
export default function RootError({ retry }: { error: Error; retry: () => void }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
      <ErrorState
        title="Cette page n'a pas pu s'afficher."
        retry={retry}
        backHref="/"
        backLabel="Retour à l'accueil"
      />
    </div>
  );
}
