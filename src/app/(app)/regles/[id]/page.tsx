import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Archive, ScrollText } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { RuleForm } from "@/components/rules/rule-form";
import { Button, buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { getRule, listRuleFormOptions } from "@/db/queries/rules";
import { archiveRuleAction, setRuleEnabledAction, updateRuleAction } from "@/lib/rules/actions";
import { parseRuleConditions } from "@/lib/rules/criteria";
import { getFormats } from "@/i18n/formats";
import { requireUser } from "@/lib/session";
import { getTranslations } from "next-intl/server";

export default async function EditRulePage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("rules.editor");
  const tl = await getTranslations("rules.list");
  const fmt = await getFormats();
  const user = await requireUser();
  if (!user.organizationId) redirect("/dashboard");
  const { id } = await params;
  const data = await getRule(user, id).catch(() => null);
  if (!data) notFound();
  const { rule, template } = data;
  const [options] = await Promise.all([listRuleFormOptions(user)]);

  return (
    <>
      {/* L'état et les gestes de la règle vivent dans l'en-tête (avant : revenir à la liste pour désactiver ou archiver,
          et une ligne de méta qui flottait entre l'en-tête et la carte). */}
      <PageHeader
        title={rule.name}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {!rule.enabled && <StatusBadge>{tl("desactivee")}</StatusBadge>}
            <span>
              {template ? t("gabarit_version_n", { n: template.version }) : t("sans_gabarit")}
              {rule.autoSendConfirmedAt ? ` · ${t("opt_in_donne_le", { when: fmt.date(rule.autoSendConfirmedAt) })}` : ""}
            </span>
          </span>
        }
        backTo={{ href: "/regles", label: t("regles") }}
        actions={
          <>
            <form action={setRuleEnabledAction.bind(null, { ruleId: rule.id, enabled: !rule.enabled })}>
              <Button type="submit" variant="outline">
                {rule.enabled ? tl("desactiver") : tl("activer")}
              </Button>
            </form>
            <form action={archiveRuleAction.bind(null, { ruleId: rule.id })}>
              <Button type="submit" variant="ghost" aria-label={tl("archiver_la_regle", { name: rule.name })} title={tl("archiver_le_journal_reste")}>
                <Archive />
                {tl("archiver")}
              </Button>
            </form>
            <Link href={`/regles/journal?regle=${rule.id}`} className={buttonVariants({ variant: "ghost" })}>
              <ScrollText />
              {tl("journal")}
            </Link>
          </>
        }
      />
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
