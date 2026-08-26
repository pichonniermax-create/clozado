"use client";

import { ErrorState } from "@/components/ui/error-state";
import { useTranslations } from "next-intl";

/** Le suivi n'a pas pu être chargé. — jamais l'écran technique brut ; `retry()` recharge le segment. */
export default function FollowUpError({ retry }: { error: Error; retry: () => void }) {
  const t = useTranslations("shell.boundaries.followup");
  return (
    <ErrorState
      title={t("le_suivi_n_a_pas_pu_5372")}
      retry={retry}
    />
  );
}
