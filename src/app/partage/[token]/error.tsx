"use client";

import { ErrorState } from "@/components/ui/error-state";

/**
 * Erreur sur la vitrine publique — même discipline que sa page d'erreur
 * métier : sobre, non brandée, ne nomme jamais personne.
 */
export default function ShareError({ retry }: { error: Error; retry: () => void }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <ErrorState title="Cette page n'a pas pu s'afficher." retry={retry}>
        Réessaie dans un instant. Si le problème persiste, contacte la personne qui t&apos;a
        envoyé ce lien.
      </ErrorState>
    </div>
  );
}
