"use client";

import { ErrorState } from "@/components/ui/error-state";

/** La veille n'a pas pu être chargée — jamais l'écran technique brut ; `retry()` recharge le segment. */
export default function WatchError({ retry }: { error: Error; retry: () => void }) {
  return <ErrorState title="La veille n'a pas pu être chargée." retry={retry} />;
}
