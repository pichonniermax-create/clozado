import { NotFoundState } from "@/components/ui/not-found-state";
import { useTranslations } from "next-intl";

/** Ce partenaire n'existe pas. */
export default function PartnerNotFound() {
  const t = useTranslations("partners.detailNotFound");
  return (
    <NotFoundState title={t("ce_partenaire_n_existe_pas")} backHref="/partenaires" backLabel={t("retour_aux_partenaires")}>
      {t("le_lien_est_peut_etre_perime_4d7c")}
    </NotFoundState>
  );
}
