"use client";

import { ErrorState } from "@/components/ui/error-state";
import { useTranslations } from "next-intl";

/** Les concurrents n'ont pas pu être chargés — jamais l'écran technique brut ; `retry()` recharge le segment. */
export default function CompetitorsError({ retry }: { error: Error; retry: () => void }) {
  const t = useTranslations("shell.boundaries.watch");
  return <ErrorState title={t("les_concurrents_n_ont_pas_pu_3d9b")} retry={retry} />;
}
