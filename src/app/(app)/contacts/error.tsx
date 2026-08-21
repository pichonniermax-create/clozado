"use client";

import { Button } from "@/components/ui/button";

/**
 * Erreur de chargement des contacts — jamais l'écran technique brut.
 * `reset()` relance le rendu du segment.
 */
export default function ContactsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border px-6 py-16 text-center">
      <p className="text-sm font-medium">Les contacts n&apos;ont pas pu être chargés.</p>
      <p className="max-w-md text-sm text-muted-foreground">
        C&apos;est en général passager. Réessaie — si ça persiste, recharge la page ou reviens dans
        quelques minutes.
      </p>
      <Button onClick={reset} variant="outline">
        Réessayer
      </Button>
    </div>
  );
}
