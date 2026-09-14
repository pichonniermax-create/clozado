"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/ui/error-state";
import { reportError } from "@/lib/log";
import { useTranslations } from "next-intl";

/** Cet écran n'a pas pu être chargé. — jamais l'écran technique brut ; `retry()` recharge le segment ; l'erreur est journalisée côté navigateur (audit, constat Q4). */
export default function AppError({ error, retry }: { error: Error; retry: () => void }) {
  const t = useTranslations("shell.boundaries.shell");
  useEffect(() => {
    reportError(error, { boundary: "app" });
  }, [error]);
  return (
    <ErrorState
      title={t("cet_ecran_n_a_pas_pu_737e")}
      retry={retry}
      backHref="/dashboard"
      backLabel={t("tableau_de_bord")}
    />
  );
}
