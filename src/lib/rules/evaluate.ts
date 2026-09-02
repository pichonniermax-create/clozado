import { getSuppression } from "@/db/queries/email-events";
import {
  countAutomaticSentInPeriod,
  createRuleDraftMessage,
  createRuleTask,
  finishRuleRun,
  getRuleOrganization,
  getRuleUsers,
  listActiveRulesOfOrganization,
  matchingContacts,
  recordRuleAction,
  startRuleRun,
  touchRuleLastRun,
  type MatchedContact,
  type RuleRunCounters,
  type RuleUser,
} from "@/db/queries/rules";
import type { Organization, Rule, RuleRun, RuleTemplate } from "@/db/schema";
import { toAppLocale } from "@/i18n/locales";
import { translatorFor } from "@/i18n/translator";
import { sendEmail } from "@/lib/email/resend";
import { productSender, resolveSender } from "@/lib/email/sender";
import { renderRuleTemplate, templateUsesVariable, type RuleTemplateVariable } from "@/lib/rules/template";
import { todayInTimeZone, toTimeZone } from "@/lib/timezone";

/**
 * L'ÉVALUATION (§5.2) : pour chaque règle active, les contacts vivants qui
 * matchent conditions ET déclencheur, moins ceux déjà traités dans la
 * fenêtre du seuil ; puis l'action — et UNE ligne de journal par contact,
 * `done` ou `skipped` avec le motif. AUCUN email ne part d'ici : l'action
 * `send_email` PRÉPARE la vague (des brouillons `automatic`), qu'un humain
 * relit et envoie d'un clic (garde-fou du 2026-09-02, non négociable) ;
 * `prepare_draft` pose ses brouillons sur les fiches. Le verrou par
 * organisation est garanti par la base, comme la veille.
 */

/** Les motifs de `skipped` — le journal les traduit à l'écran (`rules.skip.<motif>`). */
export const RULE_SKIP_REASONS = [
  "no_owner",
  "open_task",
  "no_email",
  "suppressed",
  "stopped",
  "disabled",
  "cap",
  "no_template",
  "no_reply_to",
  "no_booking_url",
  "provider",
] as const;
export type RuleSkipReason = (typeof RULE_SKIP_REASONS)[number];

type ActionResult = {
  outcome: "done" | "skipped";
  skipReason?: RuleSkipReason;
  taskId?: string | null;
  messageId?: string | null;
  templateId?: string | null;
};

type ActionContext = {
  org: Organization;
  run: RuleRun;
  rule: Rule;
  template: RuleTemplate | null;
  timeZone: string;
  origin: string;
  people: Map<string, RuleUser>;
};

export type EvaluationSummary =
  | { status: "done"; runId: string; counters: RuleRunCounters }
  | { status: "running" }
  | { status: "no_organization" };

const DEFAULT_BUDGET_MS = 60_000;

export async function evaluateOrganizationRules(
  organizationId: string,
  trigger: "cron" | "manual",
  opts: { origin: string; budgetMs?: number }
): Promise<EvaluationSummary> {
  const started = Date.now();
  const budget = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const org = await getRuleOrganization(organizationId);
  if (!org) return { status: "no_organization" };

  const startResult = await startRuleRun(organizationId, trigger);
  if (startResult.status === "running") return { status: "running" };
  const run = startResult.run;

  const counters: RuleRunCounters = { evaluated: 0, matched: 0, actionsDone: 0, actionsSkipped: 0 };
  let error: string | null = null;
  try {
    const active = await listActiveRulesOfOrganization(organizationId);
    const timeZone = toTimeZone(org.timezone);
    for (const { rule, template } of active) {
      if (Date.now() - started > budget) break;
      counters.evaluated += 1;
      const matched = await matchingContacts(rule);
      counters.matched += matched.length;
      const people = await getRuleUsers(
        matched
          .map((c) => c.ownerId)
          .concat(rule.createdBy ? [rule.createdBy] : [])
          .filter((id): id is string => id !== null)
      );
      const context: ActionContext = { org, run, rule, template, timeZone, origin: opts.origin, people };
      for (const contact of matched) {
        if (Date.now() - started > budget) break;
        const result = await executeRuleAction(context, contact);
        await recordRuleAction({
          organizationId,
          runId: run.id,
          ruleId: rule.id,
          contactId: contact.id,
          action: rule.action,
          outcome: result.outcome,
          skipReason: result.skipReason ?? null,
          taskId: result.taskId ?? null,
          messageId: result.messageId ?? null,
          templateId: result.templateId ?? null,
        });
        if (result.outcome === "done") counters.actionsDone += 1;
        else counters.actionsSkipped += 1;
      }
      await touchRuleLastRun(rule.id);
    }
  } catch (caught) {
    error = (caught instanceof Error ? caught.message : String(caught)).slice(0, 500);
  }
  await finishRuleRun(run.id, counters, error);
  return { status: "done", runId: run.id, counters };
}

/** Le responsable d'un contact pour une règle : son conseiller, sinon le créateur de la règle (§5.2). */
function ownerOf(context: ActionContext, contact: MatchedContact): RuleUser | null {
  const id = contact.ownerId ?? context.rule.createdBy;
  return id ? (context.people.get(id) ?? null) : null;
}

async function executeRuleAction(context: ActionContext, contact: MatchedContact): Promise<ActionResult> {
  switch (context.rule.action) {
    case "create_task":
      return runCreateTask(context, contact);
    case "notify_owner":
      return runNotifyOwner(context, contact);
    case "prepare_draft":
      return runPrepareEmail(context, contact, "manual");
    case "send_email":
      return runPrepareEmail(context, contact, "automatic");
    default:
      return { outcome: "skipped", skipReason: "no_template" };
  }
}

async function runCreateTask(context: ActionContext, contact: MatchedContact): Promise<ActionResult> {
  const owner = ownerOf(context, contact);
  if (!owner) return { outcome: "skipped", skipReason: "no_owner" };
  const taskId = await createRuleTask({
    organizationId: context.org.id,
    ruleId: context.rule.id,
    ruleName: context.rule.name,
    contactId: contact.id,
    assigneeId: owner.id,
    createdBy: context.rule.createdBy,
    timeZone: context.timeZone,
    todayStored: new Date(`${todayInTimeZone(context.timeZone)}T00:00:00.000Z`),
  });
  // null = une tâche ouverte existe déjà pour (règle, contact) — la base a tranché.
  if (!taskId) return { outcome: "skipped", skipReason: "open_task" };
  return { outcome: "done", taskId };
}

function escapeHtml(input: string): string {
  return input.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

async function runNotifyOwner(context: ActionContext, contact: MatchedContact): Promise<ActionResult> {
  const owner = ownerOf(context, contact);
  if (!owner) return { outcome: "skipped", skipReason: "no_owner" };
  const t = await translatorFor(toAppLocale(owner.locale ?? context.org.defaultLocale), "rules.notifications");
  const subject = t("subject", { rule: context.rule.name, contact: contact.name });
  const intro = t("body", { rule: context.rule.name, contact: contact.name, organization: context.org.name });
  const link = `${context.origin}/contacts/${contact.id}`;
  try {
    await sendEmail(
      {
        from: productSender().from,
        to: [owner.email],
        subject,
        text: `${intro}\n\n${link}\n`,
        html: `<p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`,
      },
      // Une notification par (règle, contact) et par jour au plus — la clé d'idempotence du fournisseur tranche.
      `notify/${context.rule.id}/${contact.id}/${todayInTimeZone(context.timeZone)}`
    );
  } catch {
    return { outcome: "skipped", skipReason: "provider" };
  }
  return { outcome: "done" };
}

/**
 * `prepare_draft` et `send_email` préparent le MÊME objet — un brouillon
 * rendu depuis le gabarit — et ne l'envoient jamais d'ici. Différences :
 * la nature (`manual` sur la fiche / `automatic` dans la vague) et les
 * garde-fous propres à l'envoi automatique (interrupteur, arrêt du
 * contact, plafond), vérifiés dès la préparation puis RE-vérifiés au clic.
 */
async function runPrepareEmail(context: ActionContext, contact: MatchedContact, kind: "manual" | "automatic"): Promise<ActionResult> {
  const { org, rule, template } = context;
  if (!template) return { outcome: "skipped", skipReason: "no_template" };
  const email = contact.email?.trim();
  if (!email) return { outcome: "skipped", skipReason: "no_email" };

  if (kind === "automatic") {
    if (!org.autoSendEnabled) return { outcome: "skipped", skipReason: "disabled" };
    if (contact.autoSendStoppedAt) return { outcome: "skipped", skipReason: "stopped" };
  }
  // Un brouillon vers une adresse désinscrite serait un mensonge : personne ne pourra jamais l'envoyer.
  if (await getSuppression(org.id, email)) return { outcome: "skipped", skipReason: "suppressed" };
  if (kind === "automatic" && (await countAutomaticSentInPeriod(org.id, contact.id, org.autoSendPeriodDays)) > 0) {
    return { outcome: "skipped", skipReason: "cap" };
  }

  const owner = ownerOf(context, contact);
  const sender = resolveSender(org, owner ? { email: owner.email, replyToEmail: owner.replyToEmail } : null);
  if (!sender.replyTo) return { outcome: "skipped", skipReason: "no_reply_to" };

  const bookingUrl = owner?.bookingUrl ?? "";
  const usesBooking = templateUsesVariable(template.subject, "lien_rdv") || templateUsesVariable(template.body, "lien_rdv");
  if (usesBooking && !bookingUrl) return { outcome: "skipped", skipReason: "no_booking_url" };

  const values: Record<RuleTemplateVariable, string> = {
    prenom: contact.firstName ?? "",
    nom: contact.lastName ?? "",
    nom_complet: contact.name,
    societe: contact.companyName ?? "",
    organisation: org.name,
    expediteur: org.senderName ?? org.name,
    lien_rdv: bookingUrl,
  };

  const messageId = await createRuleDraftMessage({
    organizationId: org.id,
    kind,
    ruleId: rule.id,
    contactId: contact.id,
    toEmail: email,
    fromEmail: sender.from,
    replyTo: sender.replyTo,
    subject: renderRuleTemplate(template.subject, values),
    body: renderRuleTemplate(template.body, values),
    createdBy: rule.createdBy,
  });
  return { outcome: "done", messageId, templateId: template.id };
}
