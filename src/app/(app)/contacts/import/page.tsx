import { ImportWizard } from "@/components/contacts/import-wizard";
import { PageHeader } from "@/components/app-shell/page-header";
import { requireUser } from "@/lib/session";

export default async function ContactImportPage() {
  await requireUser();
  return (
    <>
      <PageHeader
        title="Importer des contacts"
        description="Un fichier CSV, la correspondance des colonnes, un aperçu — rien n'entre avant que tu valides."
        backTo={{ href: "/contacts", label: "Contacts" }}
      />
      <ImportWizard />
    </>
  );
}
