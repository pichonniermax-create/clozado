"use client";

import { ErrorState } from "@/components/ui/error-state";
import { useTranslations } from "next-intl";

/** Cet écran n'a pas pu être chargé. — jamais l'écran technique brut ; `retry()` recharge le segment. */
export default function AppError({ retry }: { error: Error; retry: () => void }) {
  const t = useTranslations("shell.boundaries.shell");
  return (
    <ErrorState
      title={t("cet_ecran_n_a_pas_pu_737e")}
      retry={retry}
      backHref="/dashboard"
      backLabel={t("tableau_de_bord")}
    />
  );
}
