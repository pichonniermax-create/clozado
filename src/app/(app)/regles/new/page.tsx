import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import { RuleForm } from "@/components/rules/rule-form";
import { listRuleFormOptions } from "@/db/queries/rules";
import { createRuleAction } from "@/lib/rules/actions";
import { requireUser } from "@/lib/session";
import { getTranslations } from "next-intl/server";

export default async function NewRulePage({ searchParams }: { searchParams: Promise<{ erreur?: string }> }) {
  const t = await getTranslations("rules.editor");
  const user = await requireUser();
  if (!user.organizationId) redirect("/dashboard");
  const [{ erreur }, options] = await Promise.all([searchParams, listRuleFormOptions(user)]);
  return (
    <>
      <PageHeader
        title={t("nouvelle_regle")}
        description={t("une_phrase_un_declencheur_une_action")}
        backTo={{ href: "/regles", label: t("regles") }}
      />
      {erreur && <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">{erreur}</p>}
      <RuleForm
        action={createRuleAction}
        initial={{ name: "", trigger: "no_interaction", thresholdDays: 15, action: "create_task", conditions: {}, autoSendConfirmed: false }}
        template={null}
        options={options}
        submitLabel={t("creer_la_regle")}
      />
    </>
  );
}
