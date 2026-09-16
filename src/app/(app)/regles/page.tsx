import Link from "next/link";
import { redirect } from "next/navigation";
import { Archive, Pencil, Play, Plus, RotateCcw, ScrollText, Send, Workflow } from "lucide-react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { DetailsCard } from "@/components/ui/details-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ListCard } from "@/components/ui/list-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { getOwnOrganization } from "@/db/queries/organizations";
import {
  countAutomaticDrafts,
  getLatestRuleRun,
  listAutomaticDrafts,
  listRuleFormOptions,
  listRules,
  WAVE_BATCH_SIZE,
  type RuleFormOptions,
} from "@/db/queries/rules";
import {
  archiveRuleAction,
  evaluateNowAction,
  restoreRuleAction,
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

  const [, allRules, latestRun, drafts, draftCount, options] = await Promise.all([
    searchParams,
    // Les archivées aussi (stabilisation, D4) : elles vivent repliées sous la liste, avec « Restaurer ».
    listRules(user, { includeArchived: true }),
    getLatestRuleRun(org.id),
    listAutomaticDrafts(user),
    // Le vrai total (la liste est bornée) : le titre le dit, le bouton dit ce qu'un clic envoie (stabilisation, P6).
    countAutomaticDrafts(user),
    listRuleFormOptions(user),
  ]);
  const waveSize = Math.min(draftCount, WAVE_BATCH_SIZE);
  const inWindow = inOfficeWindow(org);
  const rules = allRules.filter(({ rule }) => !rule.archivedAt);
  const archivedRules = allRules.filter(({ rule }) => rule.archivedAt);

  return (
    <>
      <PageHeader
        tour="regles"
        title={t("list.regles_de_relance")}
        description={t("list.des_phrases_pas_des_automatismes_muets")}
        actions={
          <>
            {/* Le journal est une destination, pas une étiquette : un bouton, à la hauteur de « Nouvelle règle ». */}
            <Link href="/regles/journal" className={buttonVariants({ variant: "outline" })}>
              <ScrollText />
              {t("list.journal")}
            </Link>
            {/* Un seul bouton plein par écran : quand une vague attend, c'est son envoi qui compte. */}
            <Link href="/regles/new" className={buttonVariants({ variant: drafts.length > 0 ? "outline" : "default" })}>
              <Plus />
              {t("list.nouvelle_regle")}
            </Link>
          </>
        }
      />

      {/* LA VAGUE — rien ne part sans ce clic. */}
      {drafts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("wave.vague_en_attente", { n: draftCount })}</CardTitle>
            <CardDescription>{t("wave.relis_puis_envoie_les_garde_fous_sont_reverifies")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ul className="flex flex-col gap-1.5 text-sm">
              {drafts.slice(0, 20).map((draft) => (
                // Chaque ligne s'ouvre sur le brouillon lui-même (stabilisation, P6) : le corps se lit AVANT le clic qui l'envoie,
                // comme sur la fiche — « relis, puis envoie » n'était qu'un objet et un nom.
                <li key={draft.id}>
                  <details className="group/draft">
                    <summary className="flex min-w-0 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-0.5 [&::-webkit-details-marker]:hidden">
                      <span className="font-medium">{draft.contactName ?? draft.toEmail}</span>
                      <span className="min-w-0 text-muted-foreground">{draft.subject}</span>
                      {/* Le nom de la règle n'est pas un statut : un texte, pas un badge — un libellé long sortait de la carte. */}
                      {draft.ruleName && <span className="min-w-0 text-xs text-muted-foreground">{draft.ruleName}</span>}
                      <span className="text-xs text-muted-foreground underline underline-offset-2 group-open/draft:hidden">{t("wave.lire_le_brouillon")}</span>
                    </summary>
                    <div className="mt-1.5 mb-2 flex flex-col gap-1.5 rounded-lg border border-border bg-muted/30 px-3 py-2">
                      <p className="text-xs text-muted-foreground">{draft.toEmail}</p>
                      <p className="font-medium">{draft.subject}</p>
                      <p className="whitespace-pre-wrap text-muted-foreground">{draft.body}</p>
                      {draft.contactId && (
                        <Link href={`/contacts/${draft.contactId}`} className="w-fit text-xs underline underline-offset-2">
                          {t("wave.sur_la_fiche")}
                        </Link>
                      )}
                    </div>
                  </details>
                </li>
              ))}
              {draftCount > 20 && <li className="text-xs text-muted-foreground">{t("wave.et_n_autres", { n: draftCount - 20 })}</li>}
            </ul>
            {draftCount > WAVE_BATCH_SIZE && (
              <p className="text-xs text-muted-foreground">{t("wave.par_vagues_de", { batch: WAVE_BATCH_SIZE, rest: draftCount - WAVE_BATCH_SIZE })}</p>
            )}
            {org.isDemo && <p className="rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm">{t("wave.demo_envois_simules")}</p>}
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
                {t("wave.envoyer_les_n_emails", { n: waveSize })}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {rules.length === 0 ? (
        <EmptyState
          icon={<Workflow />}
          title={t("list.aucune_regle_titre")}
          action={
            <Link href="/regles/new" className={buttonVariants()}>
              <Plus />
              {t("list.nouvelle_regle")}
            </Link>
          }
        >
          {t("list.aucune_regle_pour_l_instant")}
        </EmptyState>
      ) : (
        <ListCard>
          {rules.map(({ rule }) => (
            // Sous sm, les actions passent SOUS le texte, qui garde toute la largeur (avant : trois boutons à droite
            // comprimaient le nom dans 150 px). Le texte est le lien vers la fiche — ouvrir n'est plus « trouver le crayon ».
            <li key={rule.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
              <Link href={`/regles/${rule.id}`} className="group/rule flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="line-clamp-2 text-sm font-medium underline-offset-2 group-hover/rule:underline">{rule.name}</span>
                  {!rule.enabled && <StatusBadge>{t("list.desactivee")}</StatusBadge>}
                  {rule.action === "send_email" && <StatusBadge tone="info">{t("list.envoi_automatique")}</StatusBadge>}
                </span>
                <span className="text-xs text-muted-foreground">{describeRule(rule, options, t)}</span>
                <span className="text-xs text-muted-foreground">
                  {rule.lastRunAt ? t("list.dernier_passage_le", { when: fmt.dateTime(rule.lastRunAt) }) : t("list.jamais_evaluee")}
                </span>
              </Link>
              <div className="flex shrink-0 items-center gap-1 sm:ml-auto">
                {/* Basculer l'état est un geste secondaire : en fantôme, pas en contour comme une action principale. */}
                <form action={setRuleEnabledAction.bind(null, { ruleId: rule.id, enabled: !rule.enabled })}>
                  <Button type="submit" variant="ghost" size="sm">
                    {rule.enabled ? t("list.desactiver") : t("list.activer")}
                  </Button>
                </form>
                <Link
                  href={`/regles/${rule.id}`}
                  className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
                  aria-label={t("list.modifier_la_regle", { name: rule.name })}
                  title={t("list.modifier")}
                >
                  <Pencil />
                </Link>
                {/* Archiver retire la règle de la liste : derrière la confirmation du socle, et réversible dessous (stabilisation, D4). */}
                <ConfirmSubmit
                  action={archiveRuleAction.bind(null, { ruleId: rule.id })}
                  title={t("list.archiver_titre", { name: rule.name })}
                  description={t("list.archiver_texte")}
                  confirmLabel={t("list.archiver")}
                  cancelLabel={t("list.annuler")}
                  size="icon-sm"
                  triggerLabel={t("list.archiver_la_regle", { name: rule.name })}
                >
                  <Archive />
                </ConfirmSubmit>
              </div>
            </li>
          ))}
        </ListCard>
      )}

      {archivedRules.length > 0 && (
        <DetailsCard variant="archive" flush summary={t("list.regles_archivees", { count: archivedRules.length })}>
          <ListCard>
            {archivedRules.map(({ rule }) => (
              <li key={rule.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="line-clamp-2 text-sm font-medium">{rule.name}</span>
                  <span className="text-xs text-muted-foreground">{describeRule(rule, options, t)}</span>
                </div>
                <form action={restoreRuleAction.bind(null, { ruleId: rule.id })} className="shrink-0 sm:ml-auto">
                  <Button type="submit" variant="outline" size="sm">
                    <RotateCcw />
                    {t("list.restaurer")}
                  </Button>
                </form>
              </li>
            ))}
          </ListCard>
        </DetailsCard>
      )}

      {/* Le pied de section : le geste, son dernier résultat et la note sur le passage quotidien — un seul cadre, pas trois lignes flottantes. */}
      <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1.5">
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
        <p className="text-xs text-muted-foreground text-pretty sm:max-w-sm sm:text-right">{t("list.le_cron_quotidien_evalue_aussi")}</p>
      </div>
    </>
  );
}
