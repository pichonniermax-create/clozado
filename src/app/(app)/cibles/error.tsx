"use client";

import { ErrorState } from "@/components/ui/error-state";
import { useTranslations } from "next-intl";

/** Les cibles n'ont pas pu être chargées. — jamais l'écran technique brut ; `retry()` recharge le segment. */
export default function TargetsError({ retry }: { error: Error; retry: () => void }) {
  const t = useTranslations("shell.boundaries.targets");
  return <ErrorState title={t("les_cibles_n_ont_pas_pu_2f15")} retry={retry} />;
}
