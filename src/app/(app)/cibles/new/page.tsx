import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { TargetForm } from "@/components/targets/target-form";
import { listSignatories, loadCriteriaOptions } from "@/db/queries/mail-targets";
import { requireUser } from "@/lib/session";
import { createTargetAction } from "@/lib/targets/actions";

export default async function NewTargetPage() {
  const user = await requireUser();

  if (!user.organizationId) {
    return (
      <>
        <PageHeader title="Nouvelle cible" backTo={{ href: "/cibles", label: "Cibles" }} />
        <EmptyState>
          Tu es en vue globale : choisis une organisation dans le bandeau super admin en haut de l&apos;écran avant de
          créer une cible.
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
        title="Nouvelle cible"
        description="Qui reçoit, et qui est cette personne. Le nombre de contacts se recalcule pendant que tu choisis les critères."
        backTo={{ href: "/cibles", label: "Cibles" }}
      />
      <TargetForm action={createTargetAction} options={options} signatories={signatories} submitLabel="Créer la cible" />
    </>
  );
}
