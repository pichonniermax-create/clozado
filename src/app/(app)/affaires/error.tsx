"use client";

import { ErrorState } from "@/components/ui/error-state";
import { useTranslations } from "next-intl";

/** Les affaires n'ont pas pu être chargées. — jamais l'écran technique brut ; `retry()` recharge le segment. */
export default function DealsError({ retry }: { error: Error; retry: () => void }) {
  const t = useTranslations("shell.boundaries.deals");
  return (
    <ErrorState
      title={t("les_affaires_n_ont_pas_pu_8b5d")}
      retry={retry}
    />
  );
}
