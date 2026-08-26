import { NotFoundState } from "@/components/ui/not-found-state";
import { useTranslations } from "next-intl";

export default function TargetNotFound() {
  const t = useTranslations("targets.detailNotFound");
  return (
    <NotFoundState title={t("cette_cible_n_existe_pas")} backHref="/cibles" backLabel={t("voir_les_cibles")}>
      {t("le_lien_est_peut_etre_perime_765c")}
    </NotFoundState>
  );
}
