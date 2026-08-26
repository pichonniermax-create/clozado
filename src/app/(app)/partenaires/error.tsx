"use client";

import { ErrorState } from "@/components/ui/error-state";
import { useTranslations } from "next-intl";

/** Les partenaires n'ont pas pu être chargés. — jamais l'écran technique brut ; `retry()` recharge le segment. */
export default function PartnersError({ retry }: { error: Error; retry: () => void }) {
  const t = useTranslations("shell.boundaries.partners");
  return (
    <ErrorState
      title={t("les_partenaires_n_ont_pas_pu_456e")}
      retry={retry}
    />
  );
}
