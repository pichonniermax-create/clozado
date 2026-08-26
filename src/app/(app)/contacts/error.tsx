"use client";

import { ErrorState } from "@/components/ui/error-state";
import { useTranslations } from "next-intl";

/** Les contacts n'ont pas pu être chargés. — jamais l'écran technique brut ; `retry()` recharge le segment. */
export default function ContactsError({ retry }: { error: Error; retry: () => void }) {
  const t = useTranslations("shell.boundaries.contacts");
  return (
    <ErrorState
      title={t("les_contacts_n_ont_pas_pu_9f64")}
      retry={retry}
    />
  );
}
