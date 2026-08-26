import { NotFoundState } from "@/components/ui/not-found-state";
import { useTranslations } from "next-intl";

/** Cette affaire n'existe pas. */
export default function DealNotFound() {
  const t = useTranslations("deals.detailNotFound");
  return (
    <NotFoundState title={t("cette_affaire_n_existe_pas")} backHref="/affaires" backLabel={t("retour_aux_affaires")}>
      {t("le_lien_est_peut_etre_perime_f5c6")}
    </NotFoundState>
  );
}
