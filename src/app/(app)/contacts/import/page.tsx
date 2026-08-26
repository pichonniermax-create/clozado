import { ImportWizard } from "@/components/contacts/import-wizard";
import { PageHeader } from "@/components/app-shell/page-header";
import { requireUser } from "@/lib/session";
import { getTranslations } from "next-intl/server";

export default async function ContactImportPage() {
  const t = await getTranslations("contacts.import");
  await requireUser();
  return (
    <>
      <PageHeader
        title={t("importer_des_contacts")}
        description={t("un_fichier_csv_la_correspondance_des_bda2")}
        backTo={{ href: "/contacts", label: t("contacts") }}
      />
      <ImportWizard />
    </>
  );
}
