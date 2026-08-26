"use client";

import { ErrorState } from "@/components/ui/error-state";

/** Les chiffres n'ont pas pu être chargés — jamais l'écran technique brut ; `retry()` recharge le segment. */
export default function FiguresError({ retry }: { error: Error; retry: () => void }) {
  return <ErrorState title="Les chiffres n'ont pas pu être chargés." retry={retry} />;
}
