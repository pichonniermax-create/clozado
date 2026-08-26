import { NotFoundState } from "@/components/ui/not-found-state";
import { useTranslations } from "next-intl";

/** Cette page n'existe pas dans ton espace. */
export default function AppNotFound() {
  const t = useTranslations("shell.notFound");
  return (
    <NotFoundState title={t("cette_page_n_existe_pas_dans_d28e")} backHref="/dashboard" backLabel={t("retour_au_tableau_de_bord")}>
      {t("le_lien_est_peut_etre_perime_675a")}
    </NotFoundState>
  );
}
