"use client";

import { ErrorState } from "@/components/ui/error-state";
import { useTranslations } from "next-intl";

/** Les chiffres n'ont pas pu être chargés — jamais l'écran technique brut ; `retry()` recharge le segment. */
export default function FiguresError({ retry }: { error: Error; retry: () => void }) {
  const t = useTranslations("shell.boundaries.figures");
  return <ErrorState title={t("les_chiffres_n_ont_pas_pu_785c")} retry={retry} />;
}
