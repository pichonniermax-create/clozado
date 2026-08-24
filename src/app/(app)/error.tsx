"use client";

import { ErrorState } from "@/components/ui/error-state";

/** Cet écran n'a pas pu être chargé. — jamais l'écran technique brut ; `retry()` recharge le segment. */
export default function AppError({ retry }: { error: Error; retry: () => void }) {
  return (
    <ErrorState
      title="Cet écran n'a pas pu être chargé."
      retry={retry}
      backHref="/dashboard"
      backLabel="Tableau de bord"
    />
  );
}
