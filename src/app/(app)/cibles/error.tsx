"use client";

import { ErrorState } from "@/components/ui/error-state";

/** Les cibles n'ont pas pu être chargées. — jamais l'écran technique brut ; `retry()` recharge le segment. */
export default function TargetsError({ retry }: { error: Error; retry: () => void }) {
  return <ErrorState title="Les cibles n'ont pas pu être chargées." retry={retry} />;
}
