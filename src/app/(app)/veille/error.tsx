"use client";

import { ErrorState } from "@/components/ui/error-state";
import { useTranslations } from "next-intl";

/** La veille n'a pas pu être chargée — jamais l'écran technique brut ; `retry()` recharge le segment. */
export default function WatchError({ retry }: { error: Error; retry: () => void }) {
  const t = useTranslations("shell.boundaries.watch");
  return <ErrorState title={t("la_veille_n_a_pas_pu_525a")} retry={retry} />;
}
