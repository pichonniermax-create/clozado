import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  contactTags,
  contacts,
  dealShares,
  emailMessages,
  mailTargets,
  newsletterSends,
  organizations,
  partners,
  ruleActions,
  ruleRuns,
  ruleTemplates,
  rules,
  users,
  type EmailMessage,
  type Organization,
  type Rule,
  type RuleRun,
  type RuleTemplate,
} from "@/db/schema";
import { assertOrgAccess, orgScope } from "@/db/scope";
import { localeOfOrganization } from "@/i18n/locale-lookup";
import { translatorFor } from "@/i18n/translator";
import { AppError } from "@/lib/errors";
import {
  isRuleAction,
  isRuleTrigger,
  needsTemplate,
  normalizeRuleConditions,
  parseRuleConditions,
  RULE_CONDITIONS_SCHEMA,
  type RuleConditions,
} from "@/lib/rules/criteria";
import { invalidTemplateTokens } from "@/lib/rules/template";
import type { OrgScopeUser } from "@/lib/session";
import { createActivity } from "./activities";
import { getContact } from "./contacts";
import { indicatorSql } from "./engagement";
import { memberCondition } from "./mail-targets";
import { getOwnOrganizationOrThrow } from "./newsletters";

/**
 * LE MOTEUR DE RÈGLES, côté base (§5.2) : la définition des règles et de
 * leurs gabarits FIGÉS par versions, le verrou d'évaluation (même index
 * partiel que `watch_runs`), la compilation du déclencheur et des
 * conditions en SQL sur `contacts` (même patron que `segmentCondition`),
 * le journal, le plafond, la tâche unique par (règle, contact) garantie
 * par la base, les brouillons de la vague.
 */

export const RULE_LOCK_MINUTES = 10;
/** Une règle ne retient jamais plus de contacts que ça par passage — le journal reste lisible, le passage borné. */
export const RULE_MATCH_LIMIT = 200;

/** `$1, $2, …` — une liste de valeurs, chacune paramétrée, jamais concaténée dans le texte SQL. */
function inList(values: readonly string[]): SQL {
  return sql.join(
    values.map((v) => sql`${v}`),
    sql`, `
  );
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string; cause?: { code?: string } } | null | undefined)?.code;
  const causeCode = (error as { cause?: { code?: string } } | null | undefined)?.cause?.code;
  return code === "23505" || causeCode === "23505";
}

// ---------------------------------------------------------------------------
// Les règles et leurs gabarits
// ---------------------------------------------------------------------------

export type RuleWithTemplate = { rule: Rule; template: RuleTemplate | null };

/** Le gabarit COURANT de chaque règle : la version la plus haute — les versions ne sont jamais modifiées. */
async function currentTemplates(ruleIds: string[]): Promise<Map<string, RuleTemplate>> {
  if (ruleIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(ruleTemplates)
    .where(inArray(ruleTemplates.ruleId, ruleIds))
    .orderBy(asc(ruleTemplates.ruleId), desc(ruleTemplates.version));
  const map = new Map<string, RuleTemplate>();
  for (const row of rows) {
    if (!map.has(row.ruleId)) map.set(row.ruleId, row);
  }
  return map;
}

export async function listRules(user: OrgScopeUser): Promise<RuleWithTemplate[]> {
  const rows = await db
    .select()
    .from(rules)
    .where(and(orgScope(user, rules.organizationId), isNull(rules.archivedAt)))
    .orderBy(asc(rules.position), asc(rules.createdAt));
  const templates = await currentTemplates(rows.map((r) => r.id));
  return rows.map((rule) => ({ rule, template: templates.get(rule.id) ?? null }));
}

export async function getRule(user: OrgScopeUser, id: string): Promise<RuleWithTemplate> {
  const rule = await db.query.rules.findFirst({ where: eq(rules.id, id) });
  if (!rule || rule.archivedAt) throw new AppError("regle_introuvable", undefined, 404);
  assertOrgAccess(user, rule.organizationId);
  const templates = await currentTemplates([rule.id]);
  return { rule, template: templates.get(rule.id) ?? null };
}

export type RuleInput = {
  name: string;
  trigger: string;
  thresholdDays: number;
  conditions: unknown;
  action: string;
  templateSubject?: string;
  templateBody?: string;
  /** La case cochée sous le gabarit affiché en entier — exigée pour `send_email` (opt-in explicite, §5.3). */
  confirmAutoSend?: boolean;
};

/** Valide la forme commune (création et modification) ; rend les morceaux propres à insérer. */
function validateRuleInput(input: RuleInput): {
  name: string;
  trigger: string;
  thresholdDays: number;
  conditions: RuleConditions;
  action: string;
  template: { subject: string; body: string } | null;
} {
  const name = input.name.trim();
  if (!name) throw new AppError("le_nom_de_la_regle_est_obligatoire");
  if (!isRuleTrigger(input.trigger) || !isRuleAction(input.action)) throw new AppError("common.generic");
  if (!Number.isInteger(input.thresholdDays) || input.thresholdDays < 1 || input.thresholdDays > 365) {
    throw new AppError("le_seuil_doit_etre_entre_1_et_365_jours");
  }
  const conditions = RULE_CONDITIONS_SCHEMA.safeParse(input.conditions ?? {});
  if (!conditions.success) throw new AppError("les_conditions_de_la_regle_sont_illisibles");

  let template: { subject: string; body: string } | null = null;
  if (needsTemplate(input.action)) {
    const subject = input.templateSubject?.trim() ?? "";
    const body = input.templateBody?.trim() ?? "";
    if (!subject || !body) throw new AppError("le_gabarit_objet_et_corps_sont_obligatoires");
    const tokens = [...new Set([...invalidTemplateTokens(subject), ...invalidTemplateTokens(body)])];
    if (tokens.length > 0) throw new AppError("variables_inconnues_dans_le_gabarit", { tokens: tokens.join(" ") });
    template = { subject, body };
  }
  return { name, trigger: input.trigger, thresholdDays: input.thresholdDays, conditions: normalizeRuleConditions(conditions.data), action: input.action, template };
}

export async function createRule(user: OrgScopeUser, createdBy: string, input: RuleInput): Promise<Rule> {
  const org = await getOwnOrganizationOrThrow(user);
  const valid = validateRuleInput(input);
  if (valid.action === "send_email" && !input.confirmAutoSend) throw new AppError("l_envoi_automatique_exige_l_opt_in_explicite");

  const positionRow = await db.execute(sql`select coalesce(max(position), -1) + 1 as next from ${rules} where organization_id = ${org.id}`);
  const position = Number((positionRow.rows[0] as { next: string | number }).next);
  const [rule] = await db
    .insert(rules)
    .values({
      organizationId: org.id,
      name: valid.name,
      trigger: valid.trigger,
      thresholdDays: valid.thresholdDays,
      conditions: valid.conditions,
      action: valid.action,
      autoSendConfirmedAt: valid.action === "send_email" ? new Date() : null,
      autoSendConfirmedBy: valid.action === "send_email" ? createdBy : null,
      position,
      createdBy,
    })
    .returning();
  if (valid.template) {
    await db.insert(ruleTemplates).values({ organizationId: org.id, ruleId: rule.id, version: 1, ...valid.template, createdBy });
  }
  return rule;
}

export async function updateRule(user: OrgScopeUser, ruleId: string, updatedBy: string, input: RuleInput): Promise<void> {
  const { rule, template } = await getRule(user, ruleId);
  const valid = validateRuleInput(input);
  // L'opt-in déjà donné reste ; passer une règle À l'envoi automatique exige la case, comme à la création.
  const optedIn = rule.autoSendConfirmedAt !== null || input.confirmAutoSend === true;
  if (valid.action === "send_email" && !optedIn) throw new AppError("l_envoi_automatique_exige_l_opt_in_explicite");

  await db
    .update(rules)
    .set({
      name: valid.name,
      trigger: valid.trigger,
      thresholdDays: valid.thresholdDays,
      conditions: valid.conditions,
      action: valid.action,
      autoSendConfirmedAt: rule.autoSendConfirmedAt ?? (valid.action === "send_email" ? new Date() : null),
      autoSendConfirmedBy: rule.autoSendConfirmedBy ?? (valid.action === "send_email" ? updatedBy : null),
      updatedAt: new Date(),
    })
    .where(eq(rules.id, rule.id));

  // Le gabarit est figé par versions : un changement = une version de plus, jamais une mise à jour.
  if (valid.template && (valid.template.subject !== template?.subject || valid.template.body !== template?.body)) {
    await db.insert(ruleTemplates).values({
      organizationId: rule.organizationId,
      ruleId: rule.id,
      version: (template?.version ?? 0) + 1,
      ...valid.template,
      createdBy: updatedBy,
    });
  }
}

export async function setRuleEnabled(user: OrgScopeUser, ruleId: string, enabled: boolean): Promise<void> {
  const { rule } = await getRule(user, ruleId);
  await db.update(rules).set({ enabled, updatedAt: new Date() }).where(eq(rules.id, rule.id));
}

/** Une règle ne se supprime jamais (le journal, les tâches et les emails la citent) : elle s'archive. */
export async function archiveRule(user: OrgScopeUser, ruleId: string): Promise<void> {
  const { rule } = await getRule(user, ruleId);
  await db.update(rules).set({ archivedAt: new Date(), enabled: false, updatedAt: new Date() }).where(eq(rules.id, rule.id));
}

// ---------------------------------------------------------------------------
// Le verrou d'évaluation — transposé de `startWatchRun`, garanti par la base
// ---------------------------------------------------------------------------

export type StartRuleRunResult = { status: "started"; run: RuleRun } | { status: "running"; run: RuleRun };

export async function getOpenRuleRun(organizationId: string): Promise<RuleRun | null> {
  const row = await db.query.ruleRuns.findFirst({
    where: and(eq(ruleRuns.organizationId, organizationId), isNull(ruleRuns.finishedAt)),
  });
  return row ?? null;
}

export async function getLatestRuleRun(organizationId: string): Promise<RuleRun | null> {
  const row = await db.query.ruleRuns.findFirst({
    where: eq(ruleRuns.organizationId, organizationId),
    orderBy: desc(ruleRuns.startedAt),
  });
  return row ?? null;
}

export async function startRuleRun(organizationId: string, trigger: "cron" | "manual"): Promise<StartRuleRunResult> {
  const t = await translatorFor(await localeOfOrganization(organizationId), "rules.queries");
  // Une évaluation ouverte depuis trop longtemps a été coupée : close « interrompue », sinon le verrou ne se lèverait jamais.
  await db
    .update(ruleRuns)
    .set({ finishedAt: new Date(), error: t("evaluation_interrompue_delai_depasse") })
    .where(
      and(
        eq(ruleRuns.organizationId, organizationId),
        isNull(ruleRuns.finishedAt),
        sql`${ruleRuns.startedAt} <= now() - make_interval(mins => ${RULE_LOCK_MINUTES})`
      )
    );

  const running = await getOpenRuleRun(organizationId);
  if (running) return { status: "running", run: running };

  let id: string | undefined;
  try {
    const inserted = await db.execute(sql`
      INSERT INTO ${ruleRuns} (organization_id, trigger)
      SELECT ${organizationId}::uuid, ${trigger}
      WHERE NOT EXISTS (
        SELECT 1 FROM ${ruleRuns}
        WHERE organization_id = ${organizationId}::uuid AND finished_at IS NULL
      )
      RETURNING id
    `);
    id = (inserted.rows[0] as { id?: string } | undefined)?.id;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    id = undefined;
  }
  if (!id) {
    const concurrent = await getOpenRuleRun(organizationId);
    if (concurrent) return { status: "running", run: concurrent };
    throw new AppError("l_evaluation_n_a_pas_pu_demarrer");
  }
  const run = await db.query.ruleRuns.findFirst({ where: eq(ruleRuns.id, id) });
  if (!run) throw new AppError("l_evaluation_n_a_pas_pu_demarrer");
  return { status: "started", run };
}

export type RuleRunCounters = { evaluated: number; matched: number; actionsDone: number; actionsSkipped: number };

export async function finishRuleRun(runId: string, counters: RuleRunCounters, error: string | null): Promise<void> {
  await db
    .update(ruleRuns)
    .set({ finishedAt: new Date(), ...counters, error })
    .where(eq(ruleRuns.id, runId));
}

export async function touchRuleLastRun(ruleId: string): Promise<void> {
  await db.update(rules).set({ lastRunAt: new Date() }).where(eq(rules.id, ruleId));
}

/** Les organisations qui ont au moins une règle active — celles que le passage quotidien évalue. */
export async function listOrganizationsWithActiveRules(): Promise<string[]> {
  // L'organisation de démo n'est jamais évaluée par le cron (docs/module-demo.md §1.3).
  const rows = await db.execute(sql`
    select distinct r.organization_id as id from ${rules} r
    join organizations o on o.id = r.organization_id and o.is_demo = false
    where r.enabled = true and r.archived_at is null`);
  return (rows.rows as { id: string }[]).map((r) => r.id);
}

// ---------------------------------------------------------------------------
// La compilation — déclencheur + conditions + anti-répétition, sur `contacts`
// ---------------------------------------------------------------------------

/** Le déclencheur (§5.2), borné au seuil de la règle. Écrit contre `contacts` sans alias, comme `segmentCondition`. */
function triggerSql(rule: Rule): SQL {
  const days = rule.thresholdDays;
  const org = rule.organizationId;
  switch (rule.trigger) {
    case "no_appointment":
      // « dernier rendez-vous » NULL ou plus vieux que X jours — un rendez-vous À VENIR rend la règle silencieuse (§3.6).
      return sql`NOT EXISTS (
        SELECT 1 FROM appointments a
        WHERE a.contact_id = ${contacts.id} AND a.organization_id = ${org}
          AND a.status = 'scheduled' AND a.starts_at > now() - make_interval(days => ${days}))`;
    case "no_interaction": {
      const indicator = indicatorSql(sql`${contacts.id}`, sql`${org}::uuid`);
      return sql`COALESCE(${indicator.lastInteraction}, '-infinity'::timestamptz) < now() - make_interval(days => ${days})`;
    }
    case "email_not_opened":
    case "email_not_clicked": {
      // Le DERNIER email remis (newsletter ou manuel — jamais un automatique : anti-boucle),
      // envoyé il y a plus de X jours, jamais ouvert / cliqué.
      const mark = rule.trigger === "email_not_opened" ? sql`m.first_opened_at IS NULL` : sql`m.first_clicked_at IS NULL`;
      return sql`EXISTS (
        SELECT 1 FROM ${emailMessages} m
        WHERE m.contact_id = ${contacts.id} AND m.organization_id = ${org}
          AND m.kind IN ('newsletter', 'manual') AND m.delivered_at IS NOT NULL
          AND m.sent_at < now() - make_interval(days => ${days})
          AND ${mark}
          AND m.sent_at = (
            SELECT max(m2.sent_at) FROM ${emailMessages} m2
            WHERE m2.contact_id = ${contacts.id} AND m2.organization_id = ${org}
              AND m2.kind IN ('newsletter', 'manual') AND m2.delivered_at IS NOT NULL))`;
    }
    case "share_unanswered":
      // Un partage PRM en attente depuis plus de X jours, vers un partenaire dont l'email est celui du contact.
      // Un lien renvoyé a révoqué l'ancien : c'est l'attente réelle depuis le dernier envoi qui compte.
      return sql`(${contacts.email} IS NOT NULL AND EXISTS (
        SELECT 1 FROM ${dealShares} s
        JOIN ${partners} p ON p.id = s.partner_id AND p.organization_id = s.organization_id
        WHERE s.organization_id = ${org} AND s.status = 'pending'
          AND s.sent_at < now() - make_interval(days => ${days})
          AND lower(p.email) = lower(${contacts.email})))`;
    default:
      return sql`false`;
  }
}

function conditionsSql(organizationId: string, conditions: RuleConditions, targets: { id: string; organizationId: string; kind: string; criteria: unknown }[]): SQL[] {
  const parts: SQL[] = [];
  if (conditions.tagsAny?.length) {
    parts.push(
      sql`EXISTS (SELECT 1 FROM contact_tag_assignments a WHERE a.contact_id = ${contacts.id} AND a.organization_id = ${organizationId} AND a.tag_id IN (${inList(conditions.tagsAny)}))`
    );
  }
  if (conditions.targetIds?.length) {
    // « Membre d'au moins une de ces cibles » — la même définition que partout (`memberCondition`).
    // Une cible disparue ne compile à rien ; plus aucune cible = plus personne, jamais « tout le monde ».
    const found = targets.filter((t) => conditions.targetIds?.includes(t.id));
    parts.push(
      found.length === 0
        ? sql`false`
        : sql`(${sql.join(
            found.map((t) => sql`(${memberCondition(t as Parameters<typeof memberCondition>[0])})`),
            sql` OR `
          )})`
    );
  }
  if (conditions.partnerProfessions?.length) {
    parts.push(
      sql`(${contacts.email} IS NOT NULL AND EXISTS (
        SELECT 1 FROM ${partners} p
        WHERE p.organization_id = ${organizationId} AND lower(p.email) = lower(${contacts.email})
          AND p.profession IN (${inList(conditions.partnerProfessions)})))`
    );
  }
  if (conditions.ownerIds?.length) {
    parts.push(sql`${contacts.ownerId} IN (${inList(conditions.ownerIds)})`);
  }
  return parts;
}

export type MatchedContact = {
  id: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  email: string | null;
  ownerId: string | null;
  autoSendStoppedAt: Date | null;
};

/**
 * Les contacts vivants qui matchent conditions ET déclencheur, MOINS ceux
 * déjà traités (`done`) par cette règle dans la fenêtre du seuil (§5.2) —
 * les `skipped` ne comptent pas : un contact recalé (plafond, arrêt) est
 * revu au passage suivant.
 */
export async function matchingContacts(rule: Rule, limit = RULE_MATCH_LIMIT): Promise<MatchedContact[]> {
  const conditions = parseRuleConditions(rule.conditions);
  const targets = conditions.targetIds?.length
    ? await db
        .select({ id: mailTargets.id, organizationId: mailTargets.organizationId, kind: mailTargets.kind, criteria: mailTargets.criteria })
        .from(mailTargets)
        .where(and(eq(mailTargets.organizationId, rule.organizationId), inArray(mailTargets.id, conditions.targetIds)))
    : [];

  const parts: SQL[] = [
    sql`${contacts.organizationId} = ${rule.organizationId}`,
    sql`${contacts.deletedAt} IS NULL`,
    ...conditionsSql(rule.organizationId, conditions, targets),
    triggerSql(rule),
    sql`NOT EXISTS (
      SELECT 1 FROM ${ruleActions} ra
      WHERE ra.rule_id = ${rule.id} AND ra.organization_id = ${rule.organizationId}
        AND ra.contact_id = ${contacts.id} AND ra.outcome = 'done'
        AND ra.occurred_at > now() - make_interval(days => ${rule.thresholdDays}))`,
  ];

  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      companyName: contacts.companyName,
      email: contacts.email,
      ownerId: contacts.ownerId,
      autoSendStoppedAt: contacts.autoSendStoppedAt,
    })
    .from(contacts)
    .where(
      sql.join(
        parts.map((p) => sql`(${p})`),
        sql` AND `
      )
    )
    .orderBy(asc(contacts.createdAt))
    .limit(limit);
  return rows;
}

// ---------------------------------------------------------------------------
// Le journal, le plafond, la tâche, les brouillons
// ---------------------------------------------------------------------------

export type RecordRuleActionInput = {
  organizationId: string;
  runId: string | null;
  ruleId: string;
  contactId: string;
  action: string;
  outcome: "done" | "skipped";
  skipReason?: string | null;
  taskId?: string | null;
  messageId?: string | null;
  templateId?: string | null;
};

export async function recordRuleAction(input: RecordRuleActionInput): Promise<void> {
  await db.insert(ruleActions).values({
    organizationId: input.organizationId,
    runId: input.runId,
    ruleId: input.ruleId,
    contactId: input.contactId,
    action: input.action,
    outcome: input.outcome,
    skipReason: input.skipReason ?? null,
    taskId: input.taskId ?? null,
    messageId: input.messageId ?? null,
    templateId: input.templateId ?? null,
  });
}

/** Le plafond (§5.3) : les emails AUTOMATIQUES envoyés à ce contact sur la période, toutes règles confondues. */
export async function countAutomaticSentInPeriod(organizationId: string, contactId: string, periodDays: number): Promise<number> {
  const rows = await db.execute(sql`
    select count(*)::int as n from ${emailMessages}
    where organization_id = ${organizationId} and contact_id = ${contactId}
      and kind = 'automatic' and sent_at is not null
      and sent_at > now() - make_interval(days => ${periodDays})`);
  return Number((rows.rows[0] as { n: number }).n);
}

/**
 * La tâche d'une règle : titre = nom de la règle, échéance aujourd'hui
 * (fuseau de l'organisation), responsable donné (conseiller du contact,
 * sinon créateur de la règle). UNE tâche ouverte par (règle, contact) —
 * l'index partiel tranche ; null = elle existait déjà.
 */
export async function createRuleTask(input: {
  organizationId: string;
  ruleId: string;
  ruleName: string;
  contactId: string;
  assigneeId: string;
  createdBy: string | null;
  timeZone: string;
  todayStored: Date;
}): Promise<string | null> {
  const rows = await db.execute(sql`
    insert into tasks (organization_id, title, due_at, assignee_id, contact_id, rule_id, created_by)
    values (${input.organizationId}, ${input.ruleName}, ${input.todayStored.toISOString()}, ${input.assigneeId},
            ${input.contactId}, ${input.ruleId}, ${input.createdBy})
    on conflict (rule_id, contact_id) where rule_id is not null and status = 'open' do nothing
    returning id`);
  return (rows.rows[0] as { id: string } | undefined)?.id ?? null;
}

export type RuleJournalRow = {
  id: string;
  occurredAt: Date;
  action: string;
  outcome: string;
  skipReason: string | null;
  ruleId: string;
  ruleName: string;
  contactId: string;
  contactName: string;
  templateVersion: number | null;
  taskId: string | null;
  messageId: string | null;
};

export async function listRuleJournal(
  user: OrgScopeUser,
  filter: { ruleId?: string; contactId?: string; outcome?: "done" | "skipped"; limit?: number } = {}
): Promise<RuleJournalRow[]> {
  const where = [orgScope(user, ruleActions.organizationId)];
  if (filter.ruleId) where.push(eq(ruleActions.ruleId, filter.ruleId));
  if (filter.contactId) where.push(eq(ruleActions.contactId, filter.contactId));
  if (filter.outcome) where.push(eq(ruleActions.outcome, filter.outcome));
  return db
    .select({
      id: ruleActions.id,
      occurredAt: ruleActions.occurredAt,
      action: ruleActions.action,
      outcome: ruleActions.outcome,
      skipReason: ruleActions.skipReason,
      ruleId: ruleActions.ruleId,
      ruleName: rules.name,
      contactId: ruleActions.contactId,
      contactName: contacts.name,
      templateVersion: ruleTemplates.version,
      taskId: ruleActions.taskId,
      messageId: ruleActions.messageId,
    })
    .from(ruleActions)
    .innerJoin(rules, eq(rules.id, ruleActions.ruleId))
    .innerJoin(contacts, eq(contacts.id, ruleActions.contactId))
    .leftJoin(ruleTemplates, eq(ruleTemplates.id, ruleActions.templateId))
    .where(and(...where))
    .orderBy(desc(ruleActions.occurredAt))
    .limit(filter.limit ?? 100);
}

export type WaveDraft = {
  id: string;
  ruleId: string | null;
  ruleName: string | null;
  contactId: string | null;
  contactName: string | null;
  toEmail: string;
  subject: string;
  body: string | null;
  createdAt: Date;
};

/** La vague en attente : les emails automatiques PRÉPARÉS (brouillons) — rien ne part sans un clic humain. */
export async function listAutomaticDrafts(user: OrgScopeUser, filter: { ruleId?: string } = {}): Promise<WaveDraft[]> {
  const where = [
    orgScope(user, emailMessages.organizationId),
    eq(emailMessages.kind, "automatic"),
    eq(emailMessages.status, "draft"),
  ];
  if (filter.ruleId) where.push(eq(emailMessages.ruleId, filter.ruleId));
  return db
    .select({
      id: emailMessages.id,
      ruleId: emailMessages.ruleId,
      ruleName: rules.name,
      contactId: emailMessages.contactId,
      contactName: contacts.name,
      toEmail: emailMessages.toEmail,
      subject: emailMessages.subject,
      body: emailMessages.body,
      createdAt: emailMessages.createdAt,
    })
    .from(emailMessages)
    .leftJoin(rules, eq(rules.id, emailMessages.ruleId))
    .leftJoin(contacts, eq(contacts.id, emailMessages.contactId))
    .where(and(...where))
    .orderBy(asc(emailMessages.createdAt))
    .limit(500);
}

export async function countAutomaticDrafts(user: OrgScopeUser): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(emailMessages)
    .where(and(orgScope(user, emailMessages.organizationId), eq(emailMessages.kind, "automatic"), eq(emailMessages.status, "draft")));
  return Number(rows[0]?.n ?? 0);
}

// ---------------------------------------------------------------------------
// Les accès SANS session — l'évaluation (cron) et la vague travaillent par
// organisation, comme l'ingestion d'emails ; jamais depuis une route publique.
// ---------------------------------------------------------------------------

export async function getRuleOrganization(organizationId: string): Promise<Organization | null> {
  const row = await db.query.organizations.findFirst({ where: eq(organizations.id, organizationId) });
  return row ?? null;
}

/** Les règles actives d'une organisation, avec leur gabarit courant — ce que le passage évalue, dans l'ordre. */
export async function listActiveRulesOfOrganization(organizationId: string): Promise<RuleWithTemplate[]> {
  const rows = await db
    .select()
    .from(rules)
    .where(and(eq(rules.organizationId, organizationId), eq(rules.enabled, true), isNull(rules.archivedAt)))
    .orderBy(asc(rules.position), asc(rules.createdAt));
  const templates = await currentTemplates(rows.map((r) => r.id));
  return rows.map((rule) => ({ rule, template: templates.get(rule.id) ?? null }));
}

export type RuleUser = { id: string; email: string; name: string | null; locale: string | null; replyToEmail: string | null; bookingUrl: string | null };

/** Les personnes citées par un passage (conseillers, créateurs) — en un coup, jamais une requête par contact. */
export async function getRuleUsers(ids: string[]): Promise<Map<string, RuleUser>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: users.id, email: users.email, name: users.name, locale: users.locale, replyToEmail: users.replyToEmail, bookingUrl: users.bookingUrl })
    .from(users)
    .where(inArray(users.id, unique));
  return new Map(rows.map((r) => [r.id, r]));
}

/** Une pause d'envoi (quota fournisseur) est-elle active quelque part dans l'organisation ? (§3.7 : rien d'automatique ne part pendant.) */
export async function quotaPauseActive(organizationId: string): Promise<Date | null> {
  const rows = await db
    .select({ pausedUntil: newsletterSends.pausedUntil })
    .from(newsletterSends)
    .where(and(eq(newsletterSends.organizationId, organizationId), sql`${newsletterSends.pausedUntil} > now()`))
    .orderBy(desc(newsletterSends.pausedUntil))
    .limit(1);
  return rows[0]?.pausedUntil ?? null;
}

/**
 * Le brouillon écrit par une règle : `automatic` pour la vague (§5.3 —
 * validation humaine avant chaque vague, rien ne part sans clic),
 * `manual` pour `prepare_draft` (Envoyer · Modifier · Ignorer sur la
 * fiche). `rule_id` est porté dans les deux cas — le journal cite d'où
 * vient l'email ; le CHECK des rattachements par nature veille.
 */
export async function createRuleDraftMessage(input: {
  organizationId: string;
  kind: "automatic" | "manual";
  ruleId: string;
  contactId: string;
  toEmail: string;
  fromEmail: string;
  replyTo: string;
  subject: string;
  body: string;
  createdBy: string | null;
}): Promise<string> {
  const rows = await db
    .insert(emailMessages)
    .values({
      organizationId: input.organizationId,
      kind: input.kind,
      ruleId: input.ruleId,
      contactId: input.contactId,
      toEmail: input.toEmail.toLowerCase(),
      fromEmail: input.fromEmail,
      replyTo: input.replyTo,
      subject: input.subject,
      body: input.body,
      status: "draft",
      createdBy: input.createdBy,
    })
    .returning({ id: emailMessages.id });
  return rows[0].id;
}

export type DraftWithContact = { message: EmailMessage; contactDeletedAt: Date | null; contactStoppedAt: Date | null };

/** Les lignes COMPLÈTES des brouillons automatiques (la vague), avec l'état du contact pour re-vérifier chaque garde-fou à l'envoi. */
export async function listAutomaticDraftRows(organizationId: string, filter: { ruleId?: string } = {}): Promise<DraftWithContact[]> {
  const where = [
    eq(emailMessages.organizationId, organizationId),
    eq(emailMessages.kind, "automatic"),
    eq(emailMessages.status, "draft"),
  ];
  if (filter.ruleId) where.push(eq(emailMessages.ruleId, filter.ruleId));
  const rows = await db
    .select({ message: emailMessages, contactDeletedAt: contacts.deletedAt, contactStoppedAt: contacts.autoSendStoppedAt })
    .from(emailMessages)
    .leftJoin(contacts, eq(contacts.id, emailMessages.contactId))
    .where(and(...where))
    .orderBy(asc(emailMessages.createdAt))
    .limit(200);
  return rows;
}

/** Brouillon → file de départ ; ne touche jamais un message déjà parti (le WHERE garde le statut). */
export async function markDraftQueued(messageId: string): Promise<boolean> {
  const rows = await db
    .update(emailMessages)
    .set({ status: "queued", queuedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(emailMessages.id, messageId), eq(emailMessages.status, "draft")))
    .returning({ id: emailMessages.id });
  return rows.length > 0;
}

/** L'inverse, quand le fournisseur n'a pas pris le message (quota, indisponible) : il redevient un brouillon de la vague. */
export async function revertQueuedToDraft(messageId: string): Promise<void> {
  await db
    .update(emailMessages)
    .set({ status: "draft", queuedAt: null, updatedAt: new Date() })
    .where(and(eq(emailMessages.id, messageId), eq(emailMessages.status, "queued")));
}

/** Un brouillon recalé à l'envoi (arrêt, désinscrit, plafond) ou ignoré par une personne : `canceled`, avec le motif lisible. */
export async function cancelDraft(messageId: string, reason: string, expectedStatus: "draft" | "queued" = "draft"): Promise<void> {
  await db
    .update(emailMessages)
    .set({ status: "canceled", failureReason: reason.slice(0, 500), updatedAt: new Date() })
    .where(and(eq(emailMessages.id, messageId), eq(emailMessages.status, expectedStatus)));
}

/** Les brouillons posés par une règle sur UNE fiche (préparés ou de la vague) — Envoyer · Modifier · Ignorer (§5.2). */
export async function listRuleDraftsOfContact(user: OrgScopeUser, contactId: string): Promise<WaveDraft[]> {
  return db
    .select({
      id: emailMessages.id,
      ruleId: emailMessages.ruleId,
      ruleName: rules.name,
      contactId: emailMessages.contactId,
      contactName: contacts.name,
      toEmail: emailMessages.toEmail,
      subject: emailMessages.subject,
      body: emailMessages.body,
      createdAt: emailMessages.createdAt,
    })
    .from(emailMessages)
    .leftJoin(rules, eq(rules.id, emailMessages.ruleId))
    .leftJoin(contacts, eq(contacts.id, emailMessages.contactId))
    .where(
      and(
        orgScope(user, emailMessages.organizationId),
        eq(emailMessages.contactId, contactId),
        eq(emailMessages.status, "draft"),
        sql`${emailMessages.ruleId} IS NOT NULL`
      )
    )
    .orderBy(desc(emailMessages.createdAt))
    .limit(20);
}

// ---------------------------------------------------------------------------
// Les écrans — options du formulaire, réglages, arrêt/réarmement, brouillons
// ---------------------------------------------------------------------------

export type RuleFormOptions = {
  tags: { id: string; label: string }[];
  targets: { id: string; label: string }[];
  owners: { id: string; label: string }[];
  professions: string[];
};

/** Ce que l'éditeur de conditions propose — les valeurs de l'organisation, jamais une saisie d'identifiant. */
export async function listRuleFormOptions(user: OrgScopeUser): Promise<RuleFormOptions> {
  const [tags, targets, owners, professions] = await Promise.all([
    db
      .select({ id: contactTags.id, label: contactTags.label })
      .from(contactTags)
      .where(orgScope(user, contactTags.organizationId))
      .orderBy(asc(contactTags.position), asc(contactTags.label)),
    db
      .select({ id: mailTargets.id, label: mailTargets.label })
      .from(mailTargets)
      .where(orgScope(user, mailTargets.organizationId))
      .orderBy(asc(mailTargets.position), asc(mailTargets.label)),
    db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(orgScope(user, users.organizationId))
      .orderBy(asc(users.name), asc(users.email)),
    db.execute(sql`
      select distinct profession from ${partners}
      where ${orgScope(user, partners.organizationId) ?? sql`true`} and profession is not null and profession <> ''
      order by profession`),
  ]);
  return {
    tags,
    targets,
    owners: owners.map((o) => ({ id: o.id, label: o.name ?? o.email })),
    professions: (professions.rows as { profession: string }[]).map((r) => r.profession),
  };
}

/** L'interrupteur général, la période du plafond et la fenêtre d'heures — la carte « Envois automatiques » des réglages. */
export async function updateAutoSendSettings(
  user: OrgScopeUser,
  input: { autoSendEnabled: boolean; autoSendPeriodDays: number; officeHoursStart: number; officeHoursEnd: number }
): Promise<void> {
  const org = await getOwnOrganizationOrThrow(user);
  if (!Number.isInteger(input.autoSendPeriodDays) || input.autoSendPeriodDays < 1 || input.autoSendPeriodDays > 365) {
    throw new AppError("le_seuil_doit_etre_entre_1_et_365_jours");
  }
  const { officeHoursStart: start, officeHoursEnd: end } = input;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 24 || start >= end) {
    throw new AppError("la_fenetre_d_heures_est_invalide");
  }
  await db
    .update(organizations)
    .set({
      autoSendEnabled: input.autoSendEnabled,
      autoSendPeriodDays: input.autoSendPeriodDays,
      officeHoursStart: start,
      officeHoursEnd: end,
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, org.id));
}

/**
 * L'arrêt à la main et le réarmement (§5.3) : réversibles par une personne
 * et JOURNALISÉS — une note dans la chronologie de la fiche, dans la
 * langue de l'organisation. La désinscription, elle, vit dans
 * `email_suppressions`, sans aucun chemin de retour.
 */
export async function stopAutoSendByHand(user: OrgScopeUser, sessionUserId: string, contactId: string): Promise<void> {
  const contact = await getContact(user, contactId);
  if (contact.deletedAt) throw new AppError("ce_contact_a_ete_supprime");
  if (contact.autoSendStoppedAt) return;
  await db
    .update(contacts)
    .set({ autoSendStoppedAt: new Date(), autoSendStopReason: "manual", updatedAt: new Date() })
    .where(and(eq(contacts.id, contact.id), isNull(contacts.autoSendStoppedAt)));
  const t = await translatorFor(await localeOfOrganization(contact.organizationId), "rules.queries");
  await createActivity(user, sessionUserId, { type: "note", content: t("envois_automatiques_arretes_a_la_main"), contactId: contact.id });
}

export async function rearmAutoSend(user: OrgScopeUser, sessionUserId: string, contactId: string): Promise<void> {
  const contact = await getContact(user, contactId);
  if (contact.deletedAt) throw new AppError("ce_contact_a_ete_supprime");
  if (!contact.autoSendStoppedAt) return;
  await db
    .update(contacts)
    .set({ autoSendStoppedAt: null, autoSendStopReason: null, updatedAt: new Date() })
    .where(eq(contacts.id, contact.id));
  const t = await translatorFor(await localeOfOrganization(contact.organizationId), "rules.queries");
  await createActivity(user, sessionUserId, { type: "note", content: t("envois_automatiques_rearmes"), contactId: contact.id });
}

/** Un brouillon de règle précis — pour Envoyer, Modifier ou Ignorer depuis la fiche ou la vague. */
export async function getRuleDraft(user: OrgScopeUser, messageId: string): Promise<EmailMessage> {
  const row = await db.query.emailMessages.findFirst({ where: eq(emailMessages.id, messageId) });
  if (!row || row.status !== "draft" || !row.ruleId) throw new AppError("brouillon_introuvable_ou_deja_traite", undefined, 404);
  assertOrgAccess(user, row.organizationId);
  return row;
}

export async function updateRuleDraft(user: OrgScopeUser, messageId: string, input: { subject: string; body: string }): Promise<void> {
  const draft = await getRuleDraft(user, messageId);
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject || !body) throw new AppError("le_gabarit_objet_et_corps_sont_obligatoires");
  await db
    .update(emailMessages)
    .set({ subject, body, updatedAt: new Date() })
    .where(and(eq(emailMessages.id, draft.id), eq(emailMessages.status, "draft")));
}
