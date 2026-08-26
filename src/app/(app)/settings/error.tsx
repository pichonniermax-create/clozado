"use client";

import { ErrorState } from "@/components/ui/error-state";
import { useTranslations } from "next-intl";

/** Les réglages n'ont pas pu être chargés. — jamais l'écran technique brut ; `retry()` recharge le segment. */
export default function SettingsError({ retry }: { error: Error; retry: () => void }) {
  const t = useTranslations("shell.boundaries.settings");
  return (
    <ErrorState
      title={t("les_reglages_n_ont_pas_pu_c380")}
      retry={retry}
    />
  );
}
