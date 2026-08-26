import { and, asc, count, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  contacts,
  contactTags,
  contactTagAssignments,
  deals,
  dealStatuses,
  leads,
  mailTargetMembers,
  mailTargets,
  newsletterRecipients,
  newsletters,
  origins,
  pipelines,
  signatories,
  users,
  type MailTarget,
} from "@/db/schema";
import { assertOrgAccess, orgScope } from "@/db/scope";
import { resolveBusinessPack, type BusinessPack } from "@/lib/metrics/packs";
import type { OrgScopeUser } from "@/lib/session";
import {
  describeCriteria,
  normalizeCriteria,
  parseCriteria,
  type CriteriaOptions,
  type SegmentCriteria,
} from "@/lib/targets/criteria";
import type { TargetTemplate } from "@/lib/targets/templates";
import type { TranslatorOf } from "@/i18n/translator";
import type { TargetsTranslator } from "@/lib/targets/criteria";
import { createContactTag, getContact, listContacts } from "./contacts";
import { getOwnOrganization } from "./organizations";
import { AppError } from "@/lib/errors";

/**
 * LES CIBLES — un segment VIVANT sur `contacts` (ou une sélection manuelle)
 * et une identité éditoriale. Tout ce qui compte, liste, teste ou
 * photographie les membres d'une cible passe par `memberCondition` : UNE
 * définition, quatre lecteurs (le compte, la page de membres, « de quelles
 * cibles ce contact fait partie », la photographie des destinataires au
 * marquage « envoyée »). Rien n'est matérialisé ni mis en cache : recalculé
 * à chaque consultation, comme l'exige le cahier des charges (mesures dans
 * docs/module-ciblage-contenu.md, §1.2 et « Étape 3 »).
 */

export const TARGET_MEMBERS_PAGE_SIZE = 50;

/** `$1, $2, …` — une liste de valeurs, chacune paramétrée, jamais concaténée dans le texte SQL. */
function inList(values: readonly string[]): SQL {
  return sql.join(
    values.map((v) => sql`${v}`),
    sql`, `
  );
}

/**
 * La condition SQL d'un SEGMENT sur la table `contacts` (sans alias : elle
 * s'écrit dans un `FROM "contacts"` direct, ou dans une jointure sur
 * `"contacts"`). Un critère = une condition ; les critères se combinent par
 * ET ; une liste dans un critère se lit « au moins un de ». Toujours
 * bornée à l'organisation et aux fiches vivantes.
 */
export function segmentCondition(organizationId: string, criteria: SegmentCriteria): SQL {
  const c = normalizeCriteria(criteria);
  const parts: SQL[] = [
    sql`${contacts.organizationId} = ${organizationId}`,
    sql`${contacts.deletedAt} IS NULL`,
  ];

  if (c.kind) parts.push(eq(contacts.kind, c.kind));

  if (c.tagsAny?.length) {
    parts.push(
      sql`EXISTS (SELECT 1 FROM ${contactTagAssignments} a WHERE a.contact_id = ${contacts.id} AND a.organization_id = ${organizationId} AND a.tag_id IN (${inList(c.tagsAny)}))`
    );
  }
  if (c.tagsNone?.length) {
    parts.push(
      sql`NOT EXISTS (SELECT 1 FROM ${contactTagAssignments} a WHERE a.contact_id = ${contacts.id} AND a.organization_id = ${organizationId} AND a.tag_id IN (${inList(c.tagsNone)}))`
    );
  }
  if (c.cities?.length) {
    parts.push(sql`lower(${contacts.city}) IN (${inList(c.cities.map((v) => v.trim().toLowerCase()))})`);
  }
  if (c.countries?.length) {
    parts.push(sql`lower(${contacts.country}) IN (${inList(c.countries.map((v) => v.trim().toLowerCase()))})`);
  }
  if (c.ownerIds?.length) parts.push(sql`${contacts.ownerId} IN (${inList(c.ownerIds)})`);
  if (c.hasEmail) parts.push(sql`${contacts.email} IS NOT NULL AND ${contacts.email} <> ''`);
  if (c.ageMin !== undefined) {
    parts.push(
      sql`${contacts.birthDate} IS NOT NULL AND EXTRACT(YEAR FROM age(current_date, ${contacts.birthDate})) >= ${c.ageMin}`
    );
  }
  if (c.ageMax !== undefined) {
    parts.push(
      sql`${contacts.birthDate} IS NOT NULL AND EXTRACT(YEAR FROM age(current_date, ${contacts.birthDate})) <= ${c.ageMax}`
    );
  }

  const dealsOfContact = sql`d.contact_id = ${contacts.id} AND d.organization_id = ${organizationId}`;
  switch (c.deals) {
    case "any":
      parts.push(sql`EXISTS (SELECT 1 FROM ${deals} d WHERE ${dealsOfContact})`);
      break;
    case "none":
      parts.push(sql`NOT EXISTS (SELECT 1 FROM ${deals} d WHERE ${dealsOfContact})`);
      break;
    case "open":
      parts.push(
        sql`EXISTS (SELECT 1 FROM ${deals} d JOIN ${dealStatuses} s ON s.id = d.status_id WHERE ${dealsOfContact} AND s.outcome IS NULL)`
      );
      break;
    case "won":
      parts.push(
        sql`EXISTS (SELECT 1 FROM ${deals} d JOIN ${dealStatuses} s ON s.id = d.status_id WHERE ${dealsOfContact} AND s.outcome = 'won')`
      );
      break;
    case "lost":
      parts.push(
        sql`EXISTS (SELECT 1 FROM ${deals} d JOIN ${dealStatuses} s ON s.id = d.status_id WHERE ${dealsOfContact} AND s.outcome = 'lost')`
      );
      break;
  }
  if (c.dealStageIds?.length) {
    parts.push(
      sql`EXISTS (SELECT 1 FROM ${deals} d WHERE ${dealsOfContact} AND d.status_id IN (${inList(c.dealStageIds)}))`
    );
  }
  if (c.dealPipelineIds?.length) {
    parts.push(
      sql`EXISTS (SELECT 1 FROM ${deals} d WHERE ${dealsOfContact} AND d.pipeline_id IN (${inList(c.dealPipelineIds)}))`
    );
  }
  if (c.createdMoreThanDays !== undefined) {
    parts.push(sql`${contacts.createdAt} < now() - make_interval(days => ${c.createdMoreThanDays})`);
  }
  if (c.createdLessThanDays !== undefined) {
    parts.push(sql`${contacts.createdAt} >= now() - make_interval(days => ${c.createdLessThanDays})`);
  }
  if (c.inactiveForDays !== undefined) {
    parts.push(
      sql`NOT EXISTS (SELECT 1 FROM ${activities} act WHERE act.contact_id = ${contacts.id} AND act.organization_id = ${organizationId} AND act.occurred_at >= now() - make_interval(days => ${c.inactiveForDays}))`
    );
  }
  if (c.sources?.length) parts.push(sql`${contacts.source}::text IN (${inList(c.sources)})`);
  if (c.originIds?.length) {
    parts.push(
      sql`EXISTS (SELECT 1 FROM ${leads} l WHERE l.contact_id = ${contacts.id} AND l.organization_id = ${organizationId} AND l.origin_id IN (${inList(c.originIds)}))`
    );
  }

  return sql.join(
    parts.map((p) => sql`(${p})`),
    sql` AND `
  );
}

export type TargetLike = Pick<MailTarget, "id" | "organizationId" | "kind" | "criteria">;

/** La condition des MEMBRES d'une cible, segment ou sélection manuelle — le seul point d'entrée des quatre lecteurs. */
export function memberCondition(target: TargetLike): SQL {
  if (target.kind === "static") {
    return sql`(${contacts.organizationId} = ${target.organizationId}) AND (${contacts.deletedAt} IS NULL) AND (EXISTS (SELECT 1 FROM ${mailTargetMembers} m WHERE m.target_id = ${target.id} AND m.contact_id = ${contacts.id}))`;
  }
  return segmentCondition(target.organizationId, parseCriteria(target.criteria));
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/** Les cibles de l'organisation de l'appelant — actives seulement par défaut (le composer, la fiche contact) ; désactivées comprises pour l'écran des cibles. */
export async function listMailTargets(user: OrgScopeUser, opts: { includeArchived?: boolean } = {}) {
  const conditions = [orgScope(user, mailTargets.organizationId)];
  if (!opts.includeArchived) conditions.push(isNull(mailTargets.archivedAt));
  return db
    .select()
    .from(mailTargets)
    .where(and(...conditions.filter(Boolean)))
    .orderBy(asc(mailTargets.position), asc(mailTargets.label));
}

export async function getMailTarget(user: OrgScopeUser, id: string) {
  const target = await db.query.mailTargets.findFirst({ where: eq(mailTargets.id, id) });
  if (!target) throw new AppError("cible_introuvable", undefined, 404);
  assertOrgAccess(user, target.organizationId);
  return target;
}

/** Le nombre de membres de CHAQUE cible, en un seul aller-retour (une branche UNION ALL par cible). */
export async function countMembersByTarget(targets: TargetLike[]): Promise<Map<string, number>> {
  if (targets.length === 0) return new Map();
  const query = sql.join(
    targets.map((t) => sql`SELECT ${t.id}::uuid AS id, count(*)::int AS n FROM ${contacts} WHERE ${memberCondition(t)}`),
    sql` UNION ALL `
  );
  const result = await db.execute(query);
  return new Map((result.rows as { id: string; n: number }[]).map((r) => [r.id, r.n]));
}

export async function countMembers(target: TargetLike): Promise<number> {
  const [row] = await db.select({ n: count() }).from(contacts).where(memberCondition(target));
  return row?.n ?? 0;
}

export type TargetMemberRow = {
  id: string;
  name: string;
  email: string | null;
  city: string | null;
  kind: "person" | "company";
  companyName: string | null;
};

/** Les membres, par pages de 50, triés par nom — la liste réelle que le cahier des charges veut toujours consultable. */
export async function listMembers(target: TargetLike, page = 1) {
  const p = Math.max(1, page);
  const where = memberCondition(target);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: contacts.id,
        name: contacts.name,
        email: contacts.email,
        city: contacts.city,
        kind: contacts.kind,
        companyName: contacts.companyName,
      })
      .from(contacts)
      .where(where)
      .orderBy(asc(contacts.name), asc(contacts.id))
      .limit(TARGET_MEMBERS_PAGE_SIZE)
      .offset((p - 1) * TARGET_MEMBERS_PAGE_SIZE),
    db.select({ total: count() }).from(contacts).where(where),
  ]);
  return {
    rows: rows as TargetMemberRow[],
    total,
    page: p,
    pageCount: Math.max(1, Math.ceil(total / TARGET_MEMBERS_PAGE_SIZE)),
  };
}

export type SegmentPreview = {
  count: number;
  /** Combien n'ont pas d'adresse email — une newsletter ne les atteindra pas, l'écran le dit. */
  withoutEmail: number;
  sample: string[];
};

/** L'aperçu permanent de l'éditeur de critères : le nombre, les sans-email, cinq noms. */
export async function previewSegment(organizationId: string, criteria: SegmentCriteria): Promise<SegmentPreview> {
  const condition = segmentCondition(organizationId, criteria);
  const [stats, sample] = await Promise.all([
    db.execute(
      sql`SELECT count(*)::int AS total, (count(*) FILTER (WHERE ${contacts.email} IS NULL OR ${contacts.email} = ''))::int AS without_email FROM ${contacts} WHERE ${condition}`
    ),
    db.select({ name: contacts.name }).from(contacts).where(condition).orderBy(asc(contacts.name)).limit(5),
  ]);
  const row = stats.rows[0] as { total: number; without_email: number } | undefined;
  return { count: row?.total ?? 0, withoutEmail: row?.without_email ?? 0, sample: sample.map((r) => r.name) };
}

/** De quelles cibles ACTIVES ce contact fait partie — une seule requête, un booléen par cible. */
export async function listTargetsOfContact(user: OrgScopeUser, contactId: string) {
  const contact = await getContact(user, contactId);
  if (contact.deletedAt) return [];
  const targets = (await listMailTargets(user)).filter((t) => t.organizationId === contact.organizationId);
  if (targets.length === 0) return [];
  const query = sql`SELECT ${sql.join(
    targets.map(
      (t, i) =>
        sql`EXISTS (SELECT 1 FROM ${contacts} WHERE ${contacts.id} = ${contactId} AND (${memberCondition(t)})) AS ${sql.raw(`t${i}`)}`
    ),
    sql`, `
  )}`;
  const result = await db.execute(query);
  const row = (result.rows[0] ?? {}) as Record<string, boolean>;
  return targets.filter((_, i) => row[`t${i}`] === true);
}

/** Les newsletters marquées envoyées que CE contact a reçues (la photographie, jamais un recalcul). */
export async function listNewslettersReceivedByContact(user: OrgScopeUser, contactId: string) {
  const contact = await getContact(user, contactId);
  return db
    .select({
      id: newsletters.id,
      title: newsletters.title,
      subject: newsletters.subject,
      sentAt: newsletters.sentAt,
      topics: newsletters.topics,
    })
    .from(newsletterRecipients)
    .innerJoin(newsletters, eq(newsletterRecipients.newsletterId, newsletters.id))
    .where(
      and(
        eq(newsletterRecipients.contactId, contactId),
        eq(newsletterRecipients.organizationId, contact.organizationId),
        isNotNull(newsletters.sentAt)
      )
    )
    .orderBy(desc(newsletters.sentAt))
    .limit(50);
}

export type RecentSend = {
  id: string;
  title: string;
  subject: string | null;
  sentAt: Date;
  topics: string[];
  /** Le nombre de destinataires figés à l'envoi. */
  recipients: number;
  /** Combien des membres ACTUELS de la cible en faisaient partie. */
  overlap: number;
  /** `overlap` rapporté aux membres actuels, en pour-cent (null si la cible est vide). */
  overlapPercent: number | null;
};

/**
 * L'ANTI-RÉPÉTITION : ce qui a déjà été envoyé récemment aux membres
 * actuels de la cible — lu dans la photographie des destinataires, jamais
 * dans les critères. Une cible dont les critères ont changé montre donc ce
 * que ses membres d'aujourd'hui ont réellement reçu, même sous un autre
 * découpage. Douze mois, dix envois au plus, seuls ceux qui recoupent la
 * cible sont rendus.
 */
export async function listRecentSendsForTarget(target: TargetLike, memberCount: number): Promise<RecentSend[]> {
  const result = await db.execute(sql`
    SELECT n.id, n.title, n.subject, n.sent_at AS "sentAt", n.topics,
      (SELECT count(*)::int FROM ${newsletterRecipients} r WHERE r.newsletter_id = n.id) AS recipients,
      (SELECT count(*)::int FROM ${newsletterRecipients} r JOIN ${contacts} ON ${contacts.id} = r.contact_id
        WHERE r.newsletter_id = n.id AND (${memberCondition(target)})) AS overlap
    FROM ${newsletters} n
    WHERE n.organization_id = ${target.organizationId} AND n.sent_at IS NOT NULL
      AND n.sent_at >= now() - interval '365 days'
    ORDER BY n.sent_at DESC
    LIMIT 10`);
  const rows = result.rows as {
    id: string;
    title: string;
    subject: string | null;
    sentAt: string | Date;
    topics: string[] | null;
    recipients: number;
    overlap: number;
  }[];
  return rows
    .filter((r) => r.overlap > 0)
    .map((r) => ({
      id: r.id,
      title: r.title,
      subject: r.subject,
      sentAt: new Date(r.sentAt),
      topics: r.topics ?? [],
      recipients: r.recipients,
      overlap: r.overlap,
      overlapPercent: memberCount > 0 ? Math.round((r.overlap / memberCount) * 100) : null,
    }));
}

/** Combien de newsletters ont été marquées envoyées à cette cible — l'éditeur prévient que leur historique ne bouge pas. */
export async function countSentNewslettersForTarget(targetId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(newsletters)
    .where(and(eq(newsletters.targetId, targetId), isNotNull(newsletters.sentAt)));
  return row?.n ?? 0;
}

/** Tout ce que l'éditeur de critères et les descriptions ont besoin de nommer, pour une organisation. */
export async function loadCriteriaOptions(organizationId: string): Promise<CriteriaOptions> {
  const [tags, orgUsers, pipelineRows, stageRows, originRows, cityRows, countryRows] = await Promise.all([
    db
      .select({ id: contactTags.id, label: contactTags.label })
      .from(contactTags)
      .where(eq(contactTags.organizationId, organizationId))
      .orderBy(asc(contactTags.position), asc(contactTags.label)),
    db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.organizationId, organizationId))
      .orderBy(asc(users.name)),
    db
      .select({ id: pipelines.id, label: pipelines.label })
      .from(pipelines)
      .where(eq(pipelines.organizationId, organizationId))
      .orderBy(asc(pipelines.position), asc(pipelines.createdAt)),
    db
      .select({ id: dealStatuses.id, label: dealStatuses.label, pipelineId: dealStatuses.pipelineId })
      .from(dealStatuses)
      .where(eq(dealStatuses.organizationId, organizationId))
      .orderBy(asc(dealStatuses.position), asc(dealStatuses.createdAt)),
    db
      .select({ id: origins.id, label: origins.label })
      .from(origins)
      .where(eq(origins.organizationId, organizationId))
      .orderBy(asc(origins.position), asc(origins.label)),
    db.execute(
      sql`SELECT ${contacts.city} AS v FROM ${contacts} WHERE ${contacts.organizationId} = ${organizationId} AND ${contacts.deletedAt} IS NULL AND ${contacts.city} IS NOT NULL AND ${contacts.city} <> '' GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 100`
    ),
    db.execute(
      sql`SELECT ${contacts.country} AS v FROM ${contacts} WHERE ${contacts.organizationId} = ${organizationId} AND ${contacts.deletedAt} IS NULL AND ${contacts.country} IS NOT NULL AND ${contacts.country} <> '' GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 100`
    ),
  ]);
  return {
    tags,
    users: orgUsers,
    pipelines: pipelineRows.map((p) => ({
      ...p,
      stages: stageRows.filter((s) => s.pipelineId === p.id).map((s) => ({ id: s.id, label: s.label })),
    })),
    origins: originRows,
    cities: (cityRows.rows as { v: string }[]).map((r) => r.v),
    countries: (countryRows.rows as { v: string }[]).map((r) => r.v),
  };
}

/** Les signataires de l'organisation (pour le signataire par défaut d'une cible). */
export async function listSignatories(organizationId: string) {
  return db
    .select({ id: signatories.id, name: signatories.name, jobTitle: signatories.jobTitle })
    .from(signatories)
    .where(eq(signatories.organizationId, organizationId))
    .orderBy(asc(signatories.name));
}

/** La description en phrases d'une cible : ses critères, ou « sélection manuelle ». */
export function describeTarget(target: Pick<MailTarget, "kind" | "criteria">, options: CriteriaOptions, t: TargetsTranslator): string[] {
  if (target.kind === "static") return [t("queries.selection_manuelle")];
  return describeCriteria(parseCriteria(target.criteria), options, t);
}

// ---------------------------------------------------------------------------
// Écriture
// ---------------------------------------------------------------------------

export type MailTargetInput = {
  label: string;
  description: string | null;
  kind: "segment" | "static";
  criteria: SegmentCriteria;
  persona: string | null;
  concerns: string | null;
  knowledgeLevel: string | null;
  editorialVoice: string | null;
  interests: string | null;
  avoid: string | null;
  audienceLabel: string | null;
  defaultSignatoryId: string | null;
};

/** ASCII, minuscules, tirets — `mail_targets.slug` est unique par organisation. */
function slugify(label: string): string {
  const base = label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "cible";
}

async function availableSlug(organizationId: string, label: string): Promise<string> {
  const base = slugify(label);
  const taken = new Set(
    (
      await db
        .select({ slug: mailTargets.slug })
        .from(mailTargets)
        .where(eq(mailTargets.organizationId, organizationId))
    ).map((r) => r.slug)
  );
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function nextPosition(organizationId: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${mailTargets.position}), -1)::int` })
    .from(mailTargets)
    .where(eq(mailTargets.organizationId, organizationId));
  return (row?.max ?? -1) + 1;
}

async function assertSignatoryInOrg(signatoryId: string | null, organizationId: string) {
  if (!signatoryId) return;
  const row = await db.query.signatories.findFirst({ where: eq(signatories.id, signatoryId) });
  if (!row || row.organizationId !== organizationId) throw new AppError("ce_signataire_n_appartient_pas_a_ton_5595");
}

function cleanInput(input: MailTargetInput) {
  const label = input.label.trim();
  if (!label) throw new AppError("le_nom_de_la_cible_est_obligatoire");
  const text = (v: string | null) => (v?.trim() ? v.trim() : null);
  return {
    label,
    description: text(input.description),
    kind: input.kind,
    criteria: input.kind === "segment" ? normalizeCriteria(input.criteria) : {},
    persona: text(input.persona),
    concerns: text(input.concerns),
    knowledgeLevel: text(input.knowledgeLevel),
    editorialVoice: text(input.editorialVoice),
    interests: text(input.interests),
    avoid: text(input.avoid),
    audienceLabel: text(input.audienceLabel),
    defaultSignatoryId: input.defaultSignatoryId || null,
  };
}

export async function createMailTarget(user: OrgScopeUser, input: MailTargetInput) {
  if (!user.organizationId) {
    throw new AppError("aucune_organisation_selectionnee_choisis_une_organisation_dans_a7a4");
  }
  const values = cleanInput(input);
  await assertSignatoryInOrg(values.defaultSignatoryId, user.organizationId);
  const [slug, position] = await Promise.all([
    availableSlug(user.organizationId, values.label),
    nextPosition(user.organizationId),
  ]);
  const [row] = await db
    .insert(mailTargets)
    .values({ organizationId: user.organizationId, slug, position, ...values })
    .returning();
  return row;
}

/** Libellé, nature, critères, identité — jamais le slug (clé de rattachement) ni la position. */
export async function updateMailTarget(user: OrgScopeUser, id: string, input: MailTargetInput) {
  const target = await getMailTarget(user, id);
  const values = cleanInput(input);
  await assertSignatoryInOrg(values.defaultSignatoryId, target.organizationId);
  const [row] = await db
    .update(mailTargets)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(mailTargets.id, id))
    .returning();
  return row;
}

/** Une copie complète (critères, identité, membres d'une sélection) — la voie recommandée quand une cible a déjà servi et qu'on veut la faire évoluer. */
export async function duplicateMailTarget(user: OrgScopeUser, id: string) {
  const source = await getMailTarget(user, id);
  const label = `${source.label} (copie)`;
  const [slug, position] = await Promise.all([
    availableSlug(source.organizationId, label),
    nextPosition(source.organizationId),
  ]);
  const [copy] = await db
    .insert(mailTargets)
    .values({
      organizationId: source.organizationId,
      slug,
      label,
      position,
      kind: source.kind,
      criteria: parseCriteria(source.criteria),
      description: source.description,
      persona: source.persona,
      concerns: source.concerns,
      knowledgeLevel: source.knowledgeLevel,
      editorialVoice: source.editorialVoice,
      interests: source.interests,
      avoid: source.avoid,
      audienceLabel: source.audienceLabel,
      accentColor: source.accentColor,
      defaultSignatoryId: source.defaultSignatoryId,
    })
    .returning();
  if (source.kind === "static") {
    await db.execute(
      sql`INSERT INTO ${mailTargetMembers} (organization_id, target_id, contact_id) SELECT organization_id, ${copy.id}::uuid, contact_id FROM ${mailTargetMembers} WHERE target_id = ${source.id} ON CONFLICT DO NOTHING`
    );
  }
  return copy;
}

/** Une cible ne se supprime pas : elle se désactive — l'historique des newsletters la référence. */
export async function archiveMailTarget(user: OrgScopeUser, id: string) {
  await getMailTarget(user, id);
  await db.update(mailTargets).set({ archivedAt: new Date(), updatedAt: new Date() }).where(eq(mailTargets.id, id));
}

export async function restoreMailTarget(user: OrgScopeUser, id: string) {
  await getMailTarget(user, id);
  await db.update(mailTargets).set({ archivedAt: null, updatedAt: new Date() }).where(eq(mailTargets.id, id));
}

// ---------------------------------------------------------------------------
// Sélection manuelle (cible statique)
// ---------------------------------------------------------------------------

export async function addStaticMembers(user: OrgScopeUser, targetId: string, contactIds: string[]): Promise<number> {
  const target = await getMailTarget(user, targetId);
  if (target.kind !== "static") {
    throw new AppError("cette_cible_est_un_segment_ses_membres_5680");
  }
  const ids = [...new Set(contactIds.filter(Boolean))];
  if (ids.length === 0) throw new AppError("coche_au_moins_un_contact_a_ajouter");
  // Seules les fiches vivantes de la même organisation entrent — la FK
  // composite le garantit en base, on filtre ici pour un message clair.
  const owned = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.organizationId, target.organizationId), isNull(contacts.deletedAt), inArray(contacts.id, ids)));
  if (owned.length === 0) throw new AppError("aucun_de_ces_contacts_n_appartient_a_5659");
  await db
    .insert(mailTargetMembers)
    .values(owned.map((c) => ({ organizationId: target.organizationId, targetId, contactId: c.id })))
    .onConflictDoNothing();
  return owned.length;
}

export async function removeStaticMember(user: OrgScopeUser, targetId: string, contactId: string) {
  await getMailTarget(user, targetId);
  await db
    .delete(mailTargetMembers)
    .where(and(eq(mailTargetMembers.targetId, targetId), eq(mailTargetMembers.contactId, contactId)));
}

/** La recherche de contacts à ajouter à une sélection — la même recherche que l'écran des contacts, avec « déjà dedans ». */
export async function searchContactsToAdd(user: OrgScopeUser, target: MailTarget, q: string) {
  const { rows } = await listContacts(user, { q, page: 1 });
  const candidates = rows.filter((r) => r.organizationId === target.organizationId);
  const ids = candidates.map((r) => r.id);
  const members =
    ids.length > 0
      ? await db
          .select({ contactId: mailTargetMembers.contactId })
          .from(mailTargetMembers)
          .where(and(eq(mailTargetMembers.targetId, target.id), inArray(mailTargetMembers.contactId, ids)))
      : [];
  const inside = new Set(members.map((m) => m.contactId));
  return candidates.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    city: r.city,
    kind: r.kind,
    alreadyMember: inside.has(r.id),
  }));
}

// ---------------------------------------------------------------------------
// Les cibles par défaut du métier (pack)
// ---------------------------------------------------------------------------

/** Les gabarits du pack de l'organisation qui n'ont pas encore de cible (par slug, désactivées comprises). */
export function missingPackTargets(pack: BusinessPack, existing: Pick<MailTarget, "slug">[]): TargetTemplate[] {
  const taken = new Set(existing.map((t) => t.slug));
  return pack.targets.filter((t) => !taken.has(t.slug));
}

/**
 * Instancie les cibles du pack métier de l'organisation en LIGNES de
 * `mail_targets` — les étiquettes nommées par libellé sont créées si elles
 * n'existent pas. Idempotent par slug : relancer ne crée que ce qui manque,
 * et ne touche jamais une cible existante (même modifiée, même désactivée).
 */
export async function createPackTargets(user: OrgScopeUser, t: TranslatorOf<"templates">): Promise<{ created: number; pack: BusinessPack }> {
  const org = await getOwnOrganization(user);
  if (!org) {
    throw new AppError("aucune_organisation_selectionnee_choisis_une_organisation_dans_1633");
  }
  const { pack } = resolveBusinessPack(org.businessPack);
  const existing = await db
    .select({ slug: mailTargets.slug })
    .from(mailTargets)
    .where(eq(mailTargets.organizationId, org.id));
  const missing = missingPackTargets(pack, existing);
  if (missing.length === 0) return { created: 0, pack };

  // Les étiquettes du gabarit, dans la langue de l'organisation : « Primo-accédant|Investisseur » → des libellés.
  const tagLabelsOf = (slug: TargetTemplate["slug"], which: "tagsAny" | "tagsNone"): string[] => {
    // Une clé absente est normale (tous les gabarits n'ont pas d'étiquettes) : le typage ne peut pas le savoir.
    const key = `targets.${slug}.${which}` as never;
    return t.has(key) ? String(t(key)).split("|").map((l) => l.trim()).filter(Boolean) : [];
  };
  const labels = [...new Set(missing.flatMap((tpl) => [...tagLabelsOf(tpl.slug, "tagsAny"), ...tagLabelsOf(tpl.slug, "tagsNone")]))];
  const tagIds = new Map<string, string>();
  for (const label of labels) {
    const tag = await createContactTag(user, label);
    tagIds.set(label, tag.id);
  }

  let position = await nextPosition(org.id);
  const rows = missing.map((tpl) => {
    const tagsAny = tagLabelsOf(tpl.slug, "tagsAny").map((l) => tagIds.get(l)!);
    const tagsNone = tagLabelsOf(tpl.slug, "tagsNone").map((l) => tagIds.get(l)!);
    const criteria = normalizeCriteria({
      ...tpl.criteria,
      tagsAny: tagsAny.length ? tagsAny : undefined,
      tagsNone: tagsNone.length ? tagsNone : undefined,
    });
    return {
      organizationId: org.id,
      slug: tpl.slug,
      label: t(`targets.${tpl.slug}.label`),
      description: t(`targets.${tpl.slug}.description`),
      kind: "segment" as const,
      criteria,
      persona: t(`targets.${tpl.slug}.persona`),
      concerns: t(`targets.${tpl.slug}.concerns`),
      knowledgeLevel: t(`targets.${tpl.slug}.knowledgeLevel`),
      editorialVoice: t(`targets.${tpl.slug}.editorialVoice`),
      interests: t(`targets.${tpl.slug}.interests`),
      avoid: t(`targets.${tpl.slug}.avoid`),
      position: position++,
    };
  });
  await db.insert(mailTargets).values(rows);
  return { created: rows.length, pack };
}
