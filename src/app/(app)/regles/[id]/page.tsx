import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import { RuleForm } from "@/components/rules/rule-form";
import { getRule, listRuleFormOptions } from "@/db/queries/rules";
import { updateRuleAction } from "@/lib/rules/actions";
import { parseRuleConditions } from "@/lib/rules/criteria";
import { getFormats } from "@/i18n/formats";
import { requireUser } from "@/lib/session";
import { getTranslations } from "next-intl/server";

export default async function EditRulePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erreur?: string }>;
}) {
  const t = await getTranslations("rules.editor");
  const fmt = await getFormats();
  const user = await requireUser();
  if (!user.organizationId) redirect("/dashboard");
  const { id } = await params;
  const { erreur } = await searchParams;
  const data = await getRule(user, id).catch(() => null);
  if (!data) notFound();
  const { rule, template } = data;
  const [options] = await Promise.all([listRuleFormOptions(user)]);

  return (
    <>
      <PageHeader
        title={rule.name}
        description={t("une_phrase_un_declencheur_une_action")}
        backTo={{ href: "/regles", label: t("regles") }}
      />
      {erreur && <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">{erreur}</p>}
      <p className="text-xs text-muted-foreground">
        {template ? t("gabarit_version_n", { n: template.version }) : t("sans_gabarit")}
        {rule.autoSendConfirmedAt ? ` · ${t("opt_in_donne_le", { when: fmt.date(rule.autoSendConfirmedAt) })}` : ""}
        {" · "}
        <Link href={`/regles/journal?regle=${rule.id}`} className="underline underline-offset-2 hover:text-foreground">
          {t("voir_son_journal")}
        </Link>
      </p>
      <RuleForm
        action={updateRuleAction.bind(null, rule.id)}
        initial={{
          name: rule.name,
          trigger: rule.trigger,
          thresholdDays: rule.thresholdDays,
          action: rule.action,
          conditions: parseRuleConditions(rule.conditions),
          autoSendConfirmed: rule.autoSendConfirmedAt !== null,
        }}
        template={template ? { subject: template.subject, body: template.body } : null}
        options={options}
        submitLabel={t("enregistrer")}
      />
    </>
  );
}
