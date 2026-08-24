"use client";

import { Button } from "@/components/ui/button";

/** Erreur de chargement des affaires — jamais l'écran technique brut. */
export default function DealsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border px-6 py-16 text-center">
      <p className="text-sm font-medium">Les affaires n&apos;ont pas pu être chargées.</p>
      <p className="max-w-md text-sm text-muted-foreground">
        C&apos;est en général passager et ça ne vient pas de toi. Réessaie — si ça persiste,
        reviens dans quelques minutes.
      </p>
      <Button onClick={reset} variant="outline">
        Réessayer
      </Button>
    </div>
  );
}
