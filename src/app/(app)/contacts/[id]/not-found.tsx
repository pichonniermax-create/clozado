import { NotFoundState } from "@/components/ui/not-found-state";
import { useTranslations } from "next-intl";

/** Cette fiche n'existe pas. */
export default function ContactNotFound() {
  const t = useTranslations("contacts.detailNotFound");
  return (
    <NotFoundState title={t("cette_fiche_n_existe_pas")} backHref="/contacts" backLabel={t("retour_aux_contacts")}>
      {t("le_lien_est_peut_etre_perime_4d7c")}
    </NotFoundState>
  );
}
