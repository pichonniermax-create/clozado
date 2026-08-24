"use client";

import { ErrorState } from "@/components/ui/error-state";

/** Les réglages n'ont pas pu être chargés. — jamais l'écran technique brut ; `retry()` recharge le segment. */
export default function SettingsError({ retry }: { error: Error; retry: () => void }) {
  return (
    <ErrorState
      title="Les réglages n'ont pas pu être chargés."
      retry={retry}
    />
  );
}
