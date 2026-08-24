"use client";

import { ErrorState } from "@/components/ui/error-state";

/** Le tableau de bord n'a pas pu être chargé. — jamais l'écran technique brut ; `retry()` recharge le segment. */
export default function DashboardError({ retry }: { error: Error; retry: () => void }) {
  return (
    <ErrorState
      title="Le tableau de bord n'a pas pu être chargé."
      retry={retry}
    />
  );
}
