"use client";

import { Button } from "@/components/ui/button";

/**
 * Erreur de chargement du tableau de bord — jamais l'écran technique brut.
 * `retry()` relance le chargement du segment (convention Next 16.3, qui
 * remplace `reset` pour ce cas).
 */
export default function DashboardError({ retry }: { error: Error; retry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border px-6 py-16 text-center">
      <p className="text-sm font-medium">Le tableau de bord n&apos;a pas pu être chargé.</p>
      <p className="max-w-md text-sm text-muted-foreground">
        C&apos;est en général passager. Réessaie — si ça persiste, recharge la page ou reviens dans
        quelques minutes.
      </p>
      <Button onClick={retry} variant="outline">
        Réessayer
      </Button>
    </div>
  );
}
