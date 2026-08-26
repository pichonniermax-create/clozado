"use client";

import { ErrorState } from "@/components/ui/error-state";
import { useTranslations } from "next-intl";

/** Les tâches n'ont pas pu être chargées. — jamais l'écran technique brut ; `retry()` recharge le segment. */
export default function TasksError({ retry }: { error: Error; retry: () => void }) {
  const t = useTranslations("shell.boundaries.tasks");
  return (
    <ErrorState
      title={t("les_taches_n_ont_pas_pu_a5d6")}
      retry={retry}
    />
  );
}
