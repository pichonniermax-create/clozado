"use client";

import { ErrorState } from "@/components/ui/error-state";
import { useTranslations } from "next-intl";

/** Erreur sur un écran public (accueil, connexion, inscription) — jamais l'écran technique brut. */
export default function RootError({ retry }: { error: Error; retry: () => void }) {
  const t = useTranslations("shell.rootError");
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
      <ErrorState
        title={t("cette_page_n_a_pas_pu_6ee9")}
        retry={retry}
        backHref="/"
        backLabel={t("retour_a_l_accueil")}
      />
    </div>
  );
}
