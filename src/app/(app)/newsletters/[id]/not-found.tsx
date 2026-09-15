import { NotFoundState } from "@/components/ui/not-found-state";
import { useTranslations } from "next-intl";

export default function NewsletterNotFound() {
  const t = useTranslations("newsletters.detailNotFound");
  return (
    <NotFoundState title={t("cette_newsletter_n_existe_pas")} backHref="/newsletters" backLabel={t("voir_les_newsletters")}>
      {t("le_lien_est_peut_etre_perime")}
    </NotFoundState>
  );
}
