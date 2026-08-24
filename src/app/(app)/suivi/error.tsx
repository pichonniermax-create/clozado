"use client";

import { ErrorState } from "@/components/ui/error-state";

/** Le suivi n'a pas pu être chargé. — jamais l'écran technique brut ; `retry()` recharge le segment. */
export default function FollowUpError({ retry }: { error: Error; retry: () => void }) {
  return (
    <ErrorState
      title="Le suivi n'a pas pu être chargé."
      retry={retry}
    />
  );
}
