import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { TargetForm } from "@/components/targets/target-form";
import { listSignatories, loadCriteriaOptions } from "@/db/queries/mail-targets";
import { requireUser } from "@/lib/session";
import { createTargetAction } from "@/lib/targets/actions";
import { getTranslations } from "next-intl/server";

export default async function NewTargetPage() {
  const t = await getTranslations("targets.new");
  const user = await requireUser();

  if (!user.organizationId) {
    return (
      <>
        <PageHeader title={t("nouvelle_cible")} backTo={{ href: "/cibles", label: t("cibles") }} />
        <EmptyState>
          {t("tu_es_en_vue_globale_choisis_de39")}
        </EmptyState>
      </>
    );
  }

  const [options, signatories] = await Promise.all([
    loadCriteriaOptions(user.organizationId),
    listSignatories(user.organizationId),
  ]);

  return (
    <>
      <PageHeader
        title={t("nouvelle_cible")}
        description={t("qui_recoit_et_qui_est_cette_1764")}
        backTo={{ href: "/cibles", label: t("cibles") }}
      />
      <TargetForm action={createTargetAction} options={options} signatories={signatories} submitLabel={t("creer_la_cible")} />
    </>
  );
}
