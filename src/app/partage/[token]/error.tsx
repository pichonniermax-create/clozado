"use client";

import { ErrorState } from "@/components/ui/error-state";
import { useTranslations } from "next-intl";

/**
 * Erreur sur la vitrine publique — même discipline que sa page d'erreur
 * métier : sobre, non brandée, ne nomme jamais personne.
 */
export default function ShareError({ retry }: { error: Error; retry: () => void }) {
  const t = useTranslations("shares.publicError");
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <ErrorState title={t("cette_page_n_a_pas_pu_6ee9")} retry={retry}>
        {t("reessaie_dans_un_instant_si_le_1279")}
      </ErrorState>
    </div>
  );
}
