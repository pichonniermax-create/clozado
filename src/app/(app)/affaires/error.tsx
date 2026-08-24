"use client";

import { ErrorState } from "@/components/ui/error-state";

/** Les affaires n'ont pas pu être chargées. — jamais l'écran technique brut ; `retry()` recharge le segment. */
export default function DealsError({ retry }: { error: Error; retry: () => void }) {
  return (
    <ErrorState
      title="Les affaires n'ont pas pu être chargées."
      retry={retry}
    />
  );
}
