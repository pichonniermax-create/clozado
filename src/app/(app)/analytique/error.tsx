"use client";

import { ErrorState } from "@/components/ui/error-state";
import { useTranslations } from "next-intl";

/** Erreur de chargement d'un écran analytique — jamais l'écran technique brut. */
export default function AnalyticsError({ retry }: { error: Error; retry: () => void }) {
  const t = useTranslations("shell.boundaries.analytics");
  return <ErrorState title={t("cet_ecran_analytique_n_a_pas_e12b")} retry={retry} backHref="/dashboard" backLabel={t("tableau_de_bord")} />;
}
