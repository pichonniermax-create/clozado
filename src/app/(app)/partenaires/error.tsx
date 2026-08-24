"use client";

import { ErrorState } from "@/components/ui/error-state";

/** Les partenaires n'ont pas pu être chargés. — jamais l'écran technique brut ; `retry()` recharge le segment. */
export default function PartnersError({ retry }: { error: Error; retry: () => void }) {
  return (
    <ErrorState
      title="Les partenaires n'ont pas pu être chargés."
      retry={retry}
    />
  );
}
