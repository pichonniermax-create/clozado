"use client";

import { ErrorState } from "@/components/ui/error-state";
import { useTranslations } from "next-intl";

/** Le tableau de bord n'a pas pu être chargé. — jamais l'écran technique brut ; `retry()` recharge le segment. */
export default function DashboardError({ retry }: { error: Error; retry: () => void }) {
  const t = useTranslations("shell.boundaries.dashboard");
  return <ErrorState title={t("le_tableau_de_bord_n_a_448c")} retry={retry} />;
}
