import { ImportWizard } from "@/components/contacts/import-wizard";
import { PageHeader } from "@/components/app-shell/page-header";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getTranslations } from "next-intl/server";

export default async function ContactImportPage() {
  const t = await getTranslations("contacts.import");
  const user = await requireUser();
  // Un visiteur de la démo publique n'importe rien (le proxy l'a déjà arrêté ; ceinture).
  if (user.readOnly) redirect("/dashboard");
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
