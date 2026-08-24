"use client";

import { ErrorState } from "@/components/ui/error-state";

/** Les contacts n'ont pas pu être chargés. — jamais l'écran technique brut ; `retry()` recharge le segment. */
export default function ContactsError({ retry }: { error: Error; retry: () => void }) {
  return (
    <ErrorState
      title="Les contacts n'ont pas pu être chargés."
      retry={retry}
    />
  );
}
