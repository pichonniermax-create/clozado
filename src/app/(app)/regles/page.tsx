import Link from "next/link";
import { redirect } from "next/navigation";
import { Archive, Pencil, Play, Send } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ListCard } from "@/components/ui/list-card";
import { getOwnOrganization } from "@/db/queries/organizations";
import {
  getLatestRuleRun,
  listAutomaticDrafts,
  listRuleFormOptions,
  listRules,
  type RuleFormOptions,
} from "@/db/queries/rules";
import {
  archiveRuleAction,
  evaluateNowAction,
  sendWaveAction,
  setRuleEnabledAction,
} from "@/lib/rules/actions";
import { parseRuleConditions } from "@/lib/rules/criteria";
import { inOfficeWindow } from "@/lib/rules/window";
import type { Rule } from "@/db/schema";
import { getFormats } from "@/i18n/formats";
import { requireUser } from "@/lib/session";
import { getTranslations } from "next-intl/server";
import type { TranslatorOf } from "@/i18n/translator";

/**
 * /regles (§5.4) — la liste des règles EN PHRASES, l'état, le dernier
 * passage, « Évaluer maintenant », et LA VAGUE en attente : les emails
 * automatiques préparés, qu'un humain relit et envoie d'un clic — aucun
 * envoi automatique ne part sans ça (consigne du 2026-09-02).
 */

/** La règle en une phrase : déclencheur · seuil · conditions · → action. */
function describeRule(rule: Rule, options: RuleFormOptions, t: TranslatorOf<"rules">): string {
  const conditions = parseRuleConditions(rule.conditions);
  const labelOf = (list: { id: string; label: string }[], ids: string[]) =>
    ids.map((id) => list.find((item) => item.id === id)?.label ?? "?").join(", ");
  const parts = [
    t(`editor.triggers.${rule.trigger as "no_appointment"}`),
    t("list.depuis_jours", { n: rule.thresholdDays }),
  ];
  if (conditions.tagsAny?.length) parts.push(t("list.etiquette", { labels: labelOf(options.tags, conditions.tagsAny) }));
  if (conditions.targetIds?.length) parts.push(t("list.cible", { labels: labelOf(options.targets, conditions.targetIds) }));
  if (conditions.partnerProfessions?.length) parts.push(t("list.partenaire", { labels: conditions.partnerProfessions.join(", ") }));
  if (conditions.ownerIds?.length) parts.push(t("list.conseiller", { labels: labelOf(options.owners, conditions.ownerIds) }));
  parts.push(`→ ${t(`editor.actions.${rule.action as "create_task"}`)}`);
  return parts.join(" · ");
}

export default async function RulesPage({ searchParams }: { searchParams: Promise<{ erreur?: string; info?: string }> }) {
  const t = await getTranslations("rules");
  const fmt = await getFormats();
  const user = await requireUser();
  if (!user.organizationId) redirect("/dashboard");
  const org = await getOwnOrganization(user);
  if (!org) redirect("/dashboard");

  const [{ erreur, info }, rules, latestRun, drafts, options] = await Promise.all([
    searchParams,
    listRules(user),
    getLatestRuleRun(org.id),
    listAutomaticDrafts(user),
    listRuleFormOptions(user),
  ]);
  const inWindow = inOfficeWindow(org);

  return (
    <>
      <PageHeader
        title={t("list.regles_de_relance")}
        description={t("list.des_phrases_pas_des_automatismes_muets")}
        actions={
          <span className="flex items-center gap-2">
            <Link href="/regles/journal" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              {t("list.journal")}
            </Link>
            <Link href="/regles/new" className={buttonVariants({ variant: "default" })}>
              {t("list.nouvelle_regle")}
            </Link>
          </span>
        }
      />
      {erreur && <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">{erreur}</p>}
      {info && <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">{info}</p>}

      {/* LA VAGUE — rien ne part sans ce clic. */}
      {drafts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("wave.vague_en_attente", { n: drafts.length })}</CardTitle>
            <CardDescription>{t("wave.relis_puis_envoie_les_garde_fous_sont_reverifies")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ul className="flex flex-col gap-1.5 text-sm">
              {drafts.slice(0, 20).map((draft) => (
                <li key={draft.id} className="flex flex-wrap items-center gap-2">
                  {draft.contactId ? (
                    <Link href={`/contacts/${draft.contactId}`} className="font-medium underline underline-offset-2">
                      {draft.contactName ?? draft.toEmail}
                    </Link>
                  ) : (
                    <span className="font-medium">{draft.toEmail}</span>
                  )}
                  <span className="text-muted-foreground">{draft.subject}</span>
                  {draft.ruleName && <Badge variant="secondary">{draft.ruleName}</Badge>}
                </li>
              ))}
              {drafts.length > 20 && <li className="text-xs text-muted-foreground">{t("wave.et_n_autres", { n: drafts.length - 20 })}</li>}
            </ul>
            {!org.autoSendEnabled && (
              <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">{t("wave.interrupteur_coupe_rien_ne_partira")}</p>
            )}
            {!inWindow && (
              <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">
                {t("wave.hors_heures_de_bureau", { start: org.officeHoursStart, end: org.officeHoursEnd, timezone: org.timezone })}
              </p>
            )}
            <form action={sendWaveAction}>
              <Button type="submit" disabled={!org.autoSendEnabled}>
                <Send />
                {t("wave.envoyer_les_n_emails", { n: drafts.length })}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {rules.length === 0 ? (
        <EmptyState>{t("list.aucune_regle_pour_l_instant")}</EmptyState>
      ) : (
        <ListCard>
          {rules.map(({ rule }) => (
            <li key={rule.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">{rule.name}</span>
                  {!rule.enabled && <Badge variant="outline">{t("list.desactivee")}</Badge>}
                  {rule.action === "send_email" && <Badge variant="secondary">{t("list.envoi_automatique")}</Badge>}
                </span>
                <span className="text-xs text-muted-foreground">{describeRule(rule, options, t)}</span>
                <span className="text-xs text-muted-foreground">
                  {rule.lastRunAt ? t("list.dernier_passage_le", { when: fmt.dateTime(rule.lastRunAt) }) : t("list.jamais_evaluee")}
                </span>
              </div>
              <form action={setRuleEnabledAction.bind(null, { ruleId: rule.id, enabled: !rule.enabled })}>
                <Button type="submit" variant="outline" size="sm">
                  {rule.enabled ? t("list.desactiver") : t("list.activer")}
                </Button>
              </form>
              <Link
                href={`/regles/${rule.id}`}
                className={buttonVariants({ variant: "outline", size: "icon-sm" })}
                aria-label={t("list.modifier_la_regle", { name: rule.name })}
                title={t("list.modifier")}
              >
                <Pencil />
              </Link>
              <form action={archiveRuleAction.bind(null, { ruleId: rule.id })}>
                <Button
                  type="submit"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("list.archiver_la_regle", { name: rule.name })}
                  title={t("list.archiver_le_journal_reste")}
                >
                  <Archive />
                </Button>
              </form>
            </li>
          ))}
        </ListCard>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <form action={evaluateNowAction}>
          <Button type="submit" variant="outline" disabled={rules.every(({ rule }) => !rule.enabled)}>
            <Play />
            {t("list.evaluer_maintenant")}
          </Button>
        </form>
        {latestRun && (
          <span className="text-xs text-muted-foreground">
            {latestRun.finishedAt
              ? t("list.dernier_passage_resultat", {
                  when: fmt.dateTime(latestRun.startedAt),
                  matched: latestRun.matched,
                  done: latestRun.actionsDone,
                  skipped: latestRun.actionsSkipped,
                })
              : t("list.evaluation_en_cours")}
            {latestRun.error ? ` — ${latestRun.error}` : ""}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{t("list.le_cron_quotidien_evalue_aussi")}</p>
    </>
  );
}
