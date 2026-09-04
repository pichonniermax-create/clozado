import { createHash } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { buildDefaultPipelineInserts } from "@/db/queries/deal-statuses";
import { followIndicators } from "@/db/queries/market";
import { createRule } from "@/db/queries/rules";
import { insertWatchItems, type NewWatchItemInput } from "@/db/queries/watch";
import { DEFAULT_LOCALE } from "@/i18n/locales";
import { translatorFor } from "@/i18n/translator";
import { generateApiKey, generateSiteKey } from "@/lib/acquisition/keys";
import { hashShareToken } from "@/lib/deal-shares/token";
import { resolveSender } from "@/lib/email/sender";
import { AppError } from "@/lib/errors";
import { renderRuleTemplate } from "@/lib/rules/template";
import { DEMO_ADMIN_ID, DEMO_DOMAIN, DEMO_MEMBER_ID, DEMO_ORGANIZATION_ID, DEMO_PROVIDER_PREFIX, DEMO_SLUG, demoId } from "./constants";
import * as D from "./dataset";

/**
 * LE SEMIS de l'organisation de démonstration (docs/module-demo.md §1.6) :
 * crée Vasseur Courtage et toute son histoire, dans l'ordre des
 * dépendances, avec des identifiants FIXES (`demoId`) et un générateur
 * pseudo-aléatoire à graine constante — deux créations donnent le même
 * jeu, aux dates près (tout est relatif au jour de la création : la démo
 * est toujours d'aujourd'hui). Aucune ligne n'est supprimée ici : la
 * suppression appartient à la réinitialisation (§1.7), et attend l'accord.
 *
 * Réutilise la naissance d'une organisation (`buildDefaultPipelineInserts`,
 * clé de site), les helpers idempotents (`createRule` avec sa version de
 * gabarit, `insertWatchItems`, `followIndicators`, `receiveEvents`) ; le
 * reste s'insère en lots, une requête par table, sur le pilote sans
 * transaction (comme `createOrganizationWithAdmin`).
 */

const DAY = 24 * 3600 * 1000;

/** Un générateur déterministe (mulberry32) — la même graine donne la même suite. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function money(value: number): string {
  return value.toFixed(2);
}

export type DemoCounts = Record<string, number>;

/** Les tables qui appartiennent à l'organisation — pour compter avant/après (journal `demo_resets`). */
const COUNTED_TABLES = [
  "users", "contacts", "contact_tags", "partners", "deals", "deal_shares", "commissions", "tasks", "activities", "appointments",
  "mail_targets", "newsletters", "email_messages", "email_events", "email_suppressions", "inbound_emails", "rules", "rule_actions",
  "watch_topics", "watch_sources", "watch_items", "leads", "acquisition_events", "verified_figures", "signatories", "cta_presets",
] as const;

export async function countDemoRows(organizationId: string): Promise<DemoCounts> {
  const counts: DemoCounts = {};
  for (const table of COUNTED_TABLES) {
    const rows = await db.execute(sql`select count(*)::int as n from ${sql.identifier(table)} where organization_id = ${organizationId}`);
    counts[table] = Number((rows.rows[0] as { n: number }).n);
  }
  return counts;
}

export async function getDemoOrganization() {
  return (await db.select().from(s.organizations).where(eq(s.organizations.isDemo, true)).limit(1))[0] ?? null;
}

/**
 * Crée l'organisation de démonstration. Refuse si une démo existe déjà ou si
 * le slug est pris : la création ne remplace jamais rien.
 */
export async function createDemoOrganization(now = new Date()): Promise<{ organizationId: string; counts: DemoCounts }> {
  const existing = await db
    .select({ id: s.organizations.id, slug: s.organizations.slug, isDemo: s.organizations.isDemo })
    .from(s.organizations)
    .where(sql`${s.organizations.isDemo} = true OR ${s.organizations.slug} = ${DEMO_SLUG} OR ${s.organizations.id} = ${DEMO_ORGANIZATION_ID}`);
  if (existing.length > 0) throw new AppError("demo.deja_creee");

  const random = rng(20260904);
  const orgId = DEMO_ORGANIZATION_ID;
  const claire = DEMO_ADMIN_ID;
  const thomas = DEMO_MEMBER_ID;
  const ownerId = (who: "claire" | "thomas") => (who === "claire" ? claire : thomas);
  const at = (daysAgo: number, hour = 10, minute = 0) => {
    const d = new Date(now.getTime() - daysAgo * DAY);
    d.setUTCHours(hour, minute, 0, 0);
    return d;
  };
  const todayStored = new Date(`${isoDate(now)}T00:00:00.000Z`);
  const dayStored = (offset: number) => new Date(todayStored.getTime() + offset * DAY);

  // ------------------------------------------------------------------ naissance
  const defaults = await translatorFor(DEFAULT_LOCALE, "deals.queries");
  await db.batch([
    db.insert(s.organizations).values({
      id: orgId,
      name: D.ORGANIZATION.name,
      slug: DEMO_SLUG,
      isDemo: true,
      demoPublicEnabled: false,
      tagline: D.ORGANIZATION.tagline,
      toneOfVoice: D.ORGANIZATION.toneOfVoice,
      editorialGuidelines: D.ORGANIZATION.editorialGuidelines,
      primaryColor: D.ORGANIZATION.primaryColor,
      fontFamily: D.ORGANIZATION.fontFamily,
      senderName: D.ORGANIZATION.senderName,
      senderEmail: D.ORGANIZATION.senderEmail,
      country: D.ORGANIZATION.country,
      postalAddress: D.ORGANIZATION.postalAddress,
      legalMention: D.ORGANIZATION.legalMention,
      privacyPolicyUrl: D.ORGANIZATION.privacyPolicyUrl,
      businessPack: D.ORGANIZATION.businessPack,
      allowedDomains: [...D.ORGANIZATION.allowedDomains],
      ingestToken: createHash("sha256").update("clozado-demo:ingest").digest("hex").slice(0, 20),
      storeInboundBodies: true,
      autoSendEnabled: true,
      createdAt: at(230),
    }),
    db.insert(s.users).values([
      { id: claire, email: D.PEOPLE.claire.email, name: D.PEOPLE.claire.name, role: "admin", organizationId: orgId, bookingUrl: D.PEOPLE.claire.bookingUrl, createdAt: at(230) },
      { id: thomas, email: D.PEOPLE.thomas.email, name: D.PEOPLE.thomas.name, role: "member", organizationId: orgId, bookingUrl: D.PEOPLE.thomas.bookingUrl, createdAt: at(200) },
    ]),
    ...buildDefaultPipelineInserts(orgId, defaults),
    db.insert(s.siteKeys).values({ organizationId: orgId, key: generateSiteKey() }),
  ]);
  const org = (await db.select().from(s.organizations).where(eq(s.organizations.id, orgId)))[0];
  const statuses = await db.select().from(s.dealStatuses).where(eq(s.dealStatuses.organizationId, orgId));
  const statusBySlug = new Map(statuses.map((st) => [st.slug, st]));
  const stage = (slug: string) => {
    const st = statusBySlug.get(slug);
    if (!st) throw new AppError("demo.statut_introuvable", { slug });
    return st;
  };
  const pipelineId = stage("nouveau").pipelineId;
  const sender = resolveSender(org, { email: D.PEOPLE.claire.email, replyToEmail: null });

  // ------------------------------------------------------------------ référentiels
  const dealTypeIds = D.DEAL_TYPES.map((_, i) => demoId(`deal-type:${i}`));
  const lossReasonIds = D.LOSS_REASONS.map((_, i) => demoId(`loss-reason:${i}`));
  const tagIds = D.TAGS.map((_, i) => demoId(`tag:${i}`));
  const originIds = D.ORIGINS.map((_, i) => demoId(`origin:${i}`));
  const partnerIds = D.PARTNERS.map((_, i) => demoId(`partner:${i}`));
  const signatoryId = demoId("signatory:claire");
  const targetIds = D.TARGETS.map((_, i) => demoId(`target:${i}`));
  const ctaIds = D.CTA_PRESETS.map((_, i) => demoId(`cta:${i}`));
  await db.batch([
    db.insert(s.dealTypes).values(D.DEAL_TYPES.map((label, i) => ({ id: dealTypeIds[i], organizationId: orgId, slug: slugify(label), label, position: i, createdAt: at(229) }))),
    db.insert(s.lossReasons).values(D.LOSS_REASONS.map((label, i) => ({ id: lossReasonIds[i], organizationId: orgId, label, position: i, createdAt: at(229) }))),
    db.insert(s.contactTags).values(D.TAGS.map((tag, i) => ({ id: tagIds[i], organizationId: orgId, label: tag.label, color: tag.color, position: i, createdAt: at(229) }))),
    db.insert(s.origins).values(D.ORIGINS.map((label, i) => ({ id: originIds[i], organizationId: orgId, label, position: i, createdAt: at(229) }))),
    db.insert(s.partners).values(D.PARTNERS.map((p, i) => ({ id: partnerIds[i], organizationId: orgId, ...p, createdAt: at(220 - i * 12) }))),
    db.insert(s.signatories).values({ id: signatoryId, organizationId: orgId, name: D.SIGNATORY.name, jobTitle: D.SIGNATORY.jobTitle, createdAt: at(228) }),
  ]);
  await db.batch([
    db.insert(s.mailTargets).values(
      D.TARGETS.map((t, i) => ({
        id: targetIds[i],
        organizationId: orgId,
        slug: t.slug,
        label: t.label,
        persona: t.persona,
        audienceLabel: t.audienceLabel,
        kind: "segment",
        criteria: { tagsAny: [tagIds[t.tag]], hasEmail: true },
        concerns: t.concerns,
        knowledgeLevel: t.knowledgeLevel,
        editorialVoice: t.editorialVoice,
        interests: t.interests,
        avoid: t.avoid,
        accentColor: t.accentColor,
        defaultSignatoryId: signatoryId,
        position: i,
        createdAt: at(227),
      }))
    ),
    db.insert(s.verifiedFigures).values(D.FIGURES.map((f, i) => ({ id: demoId(`figure:${i}`), organizationId: orgId, label: f.label, value: f.value, sourceName: f.sourceName, sourceUrl: `https://${DEMO_DOMAIN}/chiffres`, asOf: f.asOf, asOfDate: isoDate(at(90 + i * 30)), position: i, createdAt: at(226) }))),
    db.insert(s.ctaPresets).values(D.CTA_PRESETS.map((c, i) => ({ id: ctaIds[i], organizationId: orgId, label: c.label, url: c.url, position: i, createdAt: at(226) }))),
  ]);
  await db.insert(s.ctaPresetTargets).values([
    { ctaPresetId: ctaIds[0], targetId: targetIds[0] },
    { ctaPresetId: ctaIds[0], targetId: targetIds[2] },
    { ctaPresetId: ctaIds[1], targetId: targetIds[1] },
  ]);

  // ------------------------------------------------------------------ contacts
  const PERSONS = 40;
  const contactIds = Array.from({ length: PERSONS + D.COMPANIES.length }, (_, i) => demoId(`contact:${i}`));
  const dealByContact = new Map<number, (typeof D.DEALS)[number]>();
  D.DEALS.forEach((deal) => dealByContact.set(deal.contact, deal));
  const leadContacts = new Set<number>();
  D.DEALS.forEach((deal) => deal.fromLead && leadContacts.add(deal.contact));
  for (let i = 30; i < 38; i++) leadContacts.add(i);
  const tagsOf = (i: number): number[] => {
    if (i >= PERSONS) return [3];
    const deal = dealByContact.get(i);
    const tags: number[] = [];
    if (deal?.stage === "acceptee") tags.push(4);
    if (deal?.type === 1) tags.push(2);
    else if (i % 5 === 0) tags.push(1);
    else tags.push(0);
    return tags;
  };
  const person = (i: number) => {
    const firstName = D.FIRST_NAMES[i % D.FIRST_NAMES.length];
    const lastName = D.LAST_NAMES[(i * 7 + 3) % D.LAST_NAMES.length];
    const city = D.CITIES[i % D.CITIES.length];
    const provider = D.MAIL_PROVIDERS[i % D.MAIL_PROVIDERS.length];
    const email = i === 38 ? null : `${slugify(firstName)}.${slugify(lastName)}@${provider}`;
    return { firstName, lastName, city, email, phone: `06 ${String(10 + i).padStart(2, "0")} ${String(20 + ((i * 13) % 80)).padStart(2, "0")} ${String((i * 31) % 100).padStart(2, "0")} ${String((i * 17) % 100).padStart(2, "0")}` };
  };
  const contactOwner = (i: number): string => {
    const deal = dealByContact.get(i);
    if (deal) return ownerId(deal.owner);
    return i % 3 === 0 ? thomas : claire;
  };
  const contactCreatedAt = (i: number): Date => {
    const deal = dealByContact.get(i);
    if (deal) return at(deal.ageDays + 2 + Math.floor(random() * 5), 9);
    return at(15 + ((i * 11) % 170), 9);
  };
  const contactRows: (typeof s.contacts.$inferInsert)[] = [];
  const stoppedReasons = new Map<number, "appointment" | "replied">();
  D.APPOINTMENTS.filter((a) => !a.canceled && a.inDays > 0).forEach((a) => stoppedReasons.set(a.contact, "appointment"));
  D.INBOUND.forEach((m) => m.kind === "confirmed" && m.contact !== null && stoppedReasons.set(m.contact, "replied"));
  for (let i = 0; i < PERSONS; i++) {
    const p = person(i);
    const stopped = stoppedReasons.get(i);
    contactRows.push({
      id: contactIds[i],
      organizationId: orgId,
      kind: "person",
      name: `${p.firstName} ${p.lastName}`,
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email,
      phone: p.phone,
      jobTitle: D.JOB_TITLES[i % D.JOB_TITLES.length],
      city: p.city.city,
      postalCode: p.city.postalCode,
      country: "FR",
      birthDate: `${1972 + ((i * 7) % 26)}-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + ((i * 3) % 28)).padStart(2, "0")}`,
      notes: i % 4 === 0 ? D.ACTIVITY_LINES.note[i % D.ACTIVITY_LINES.note.length] : null,
      ownerId: contactOwner(i),
      source: leadContacts.has(i) ? "lead" : i % 5 === 4 ? "import" : "manual",
      autoSendStoppedAt: stopped ? at(1, 12) : null,
      autoSendStopReason: stopped ?? null,
      createdBy: claire,
      createdAt: contactCreatedAt(i),
    });
  }
  D.COMPANIES.forEach((c, j) => {
    const i = PERSONS + j;
    contactRows.push({
      id: contactIds[i],
      organizationId: orgId,
      kind: "company",
      name: c.name,
      email: `contact@${slugify(c.name).slice(0, 24)}.example`,
      phone: `02 40 ${String(50 + j).padStart(2, "0")} ${String(10 + j * 7).padStart(2, "0")} ${String(30 + j * 3).padStart(2, "0")}`,
      city: c.city,
      postalCode: c.postalCode,
      country: "FR",
      notes: c.notes,
      ownerId: contactOwner(i),
      source: "manual",
      createdBy: claire,
      createdAt: contactCreatedAt(i),
    });
  });
  await db.insert(s.contacts).values(contactRows);
  const assignments = contactRows.flatMap((row, i) => tagsOf(i).map((tag) => ({ organizationId: orgId, contactId: row.id!, tagId: tagIds[tag] })));
  await db.insert(s.contactTagAssignments).values(assignments);

  // ------------------------------------------------------------------ acquisition : clé d'API, leads, événements
  const apiKey = generateApiKey();
  const apiKeyId = demoId("api-key:0");
  await db.insert(s.apiKeys).values({ id: apiKeyId, organizationId: orgId, label: D.TEXTS.apiKeyLabel, keyPrefix: apiKey.prefix, keyHash: apiKey.hash, createdBy: claire, createdAt: at(120), lastUsedAt: at(1, 8) });
  const leadRows: (typeof s.leads.$inferInsert)[] = [];
  const leadIdByContact = new Map<number, string>();
  const originOf = (i: number) => i % 4;
  let leadIndex = 0;
  for (const i of [...leadContacts].sort((a, b) => a - b)) {
    const deal = dealByContact.get(i);
    const p = person(i);
    const receivedDaysAgo = deal ? deal.ageDays + 1 : 20 + ((i * 5) % 40);
    const id = demoId(`lead:${leadIndex++}`);
    leadIdByContact.set(i, id);
    leadRows.push({
      id,
      organizationId: orgId,
      contactId: contactIds[i],
      apiKeyId,
      visitorId: `visiteur-${i}`,
      receivedAt: at(receivedDaysAgo, 19),
      simulator: "simulateur-pret",
      pageUrl: `https://${DEMO_DOMAIN}/simulateur`,
      referrer: originOf(i) === 0 ? "https://recherche.example/" : null,
      utmSource: originOf(i) === 0 ? "recherche" : null,
      utmMedium: originOf(i) === 0 ? "organique" : null,
      utmCampaign: null,
      originId: originIds[originOf(i)],
      originRaw: D.ORIGINS[originOf(i)],
      simulationStartedAt: at(receivedDaysAgo, 18, 40),
      simulationCompletedAt: at(receivedDaysAgo, 18, 52),
      payload: { montant: deal?.amount ?? 200000 + i * 3500, duree: 20 + (i % 3) * 5, projet: deal?.title ?? D.TEXTS.leadProject, email: p.email },
      matchedExistingContact: false,
      enrichedFields: [],
      createdAt: at(receivedDaysAgo, 19),
    });
  }
  await db.insert(s.leads).values(leadRows);
  // Les événements de visite s'insèrent directement, par lots (l'origine est
  // résolue ici : `receiveEvents` la cherche en base événement par événement).
  const eventRows: (typeof s.acquisitionEvents.$inferInsert)[] = [];
  let visitor = 0;
  for (let day = 60; day >= 0; day--) {
    const visits = 4 + Math.floor(random() * 6);
    for (let v = 0; v < visits; v++) {
      const id = `visiteur-anonyme-${visitor++}`;
      const origin = Math.floor(random() * D.ORIGINS.length);
      const hour = 8 + Math.floor(random() * 13);
      const base = { organizationId: orgId, visitorId: id, pageUrl: `https://${DEMO_DOMAIN}/${random() < 0.5 ? "" : "simulateur"}`, referrer: null, utmSource: origin === 0 ? "recherche" : null, utmMedium: null, utmCampaign: null, simulator: "simulateur-pret", originId: originIds[origin], originRaw: D.ORIGINS[origin] };
      eventRows.push({ ...base, kind: "visit", occurredAt: at(day, hour) });
      if (random() < 0.28) {
        eventRows.push({ ...base, kind: "simulation_started", occurredAt: at(day, hour, 6) });
        if (random() < 0.45) eventRows.push({ ...base, kind: "simulation_completed", occurredAt: at(day, hour, 14) });
      }
    }
  }
  for (const lead of leadRows) {
    const base = { organizationId: orgId, visitorId: lead.visitorId!, pageUrl: lead.pageUrl ?? null, referrer: lead.referrer ?? null, utmSource: lead.utmSource ?? null, utmMedium: lead.utmMedium ?? null, utmCampaign: null, simulator: "simulateur-pret", originId: lead.originId ?? null, originRaw: lead.originRaw ?? null };
    const received = lead.receivedAt as Date;
    eventRows.push({ ...base, kind: "visit", occurredAt: new Date(received.getTime() - 25 * 60_000) });
    eventRows.push({ ...base, kind: "simulation_started", occurredAt: lead.simulationStartedAt as Date });
    eventRows.push({ ...base, kind: "simulation_completed", occurredAt: lead.simulationCompletedAt as Date });
  }
  for (let i = 0; i < eventRows.length; i += 200) await db.insert(s.acquisitionEvents).values(eventRows.slice(i, i + 200));

  // ------------------------------------------------------------------ affaires, étapes, événements
  const dealIds = D.DEALS.map((_, i) => demoId(`deal:${i}`));
  const PATHS: Record<string, string[]> = {
    nouveau: ["nouveau"],
    partagee: ["nouveau", "partagee"],
    en_negociation: ["nouveau", "partagee", "en_negociation"],
    acceptee: ["nouveau", "partagee", "en_negociation", "acceptee"],
    perdue: ["nouveau", "partagee", "perdue"],
  };
  const dealRows: (typeof s.deals.$inferInsert)[] = [];
  const stageRows: (typeof s.dealStageChanges.$inferInsert)[] = [];
  const dealEventRows: (typeof s.dealEvents.$inferInsert)[] = [];
  D.DEALS.forEach((deal, i) => {
    const contact = contactRows[deal.contact];
    const status = stage(deal.stage);
    const path = PATHS[deal.stage];
    const createdAt = at(deal.ageDays, 9 + (i % 6));
    dealRows.push({
      id: dealIds[i],
      organizationId: orgId,
      title: deal.title,
      clientName: contact.name,
      contactId: contact.id,
      leadId: deal.fromLead ? (leadIdByContact.get(deal.contact) ?? null) : null,
      typeId: dealTypeIds[deal.type],
      pipelineId,
      statusId: status.id,
      estimatedAmount: money(deal.amount),
      probability: status.probability === null ? null : status.probability.toFixed(2),
      expectedCloseDate: isoDate(new Date(createdAt.getTime() + (deal.stage === "acceptee" || deal.stage === "perdue" ? 30 : 45 + (i % 4) * 15) * DAY)),
      ownerId: ownerId(deal.owner),
      lossReasonId: deal.loss !== undefined ? lossReasonIds[deal.loss] : null,
      description: D.TEXTS.dealDescription(deal.amount.toLocaleString("fr-FR"), D.DEAL_TYPES[deal.type].toLowerCase()),
      createdBy: ownerId(deal.owner),
      createdAt,
      updatedAt: createdAt,
    });
    dealEventRows.push({ id: demoId(`deal-event:${i}:created`), organizationId: orgId, dealId: dealIds[i], type: "deal_created", message: null, actorUserId: ownerId(deal.owner), createdAt });
    let previous: string | null = null;
    path.forEach((slug, step) => {
      const st = stage(slug);
      const changedAt = step === 0 ? createdAt : new Date(createdAt.getTime() + Math.round((deal.ageDays * step) / path.length) * DAY + 3600_000 * step);
      stageRows.push({
        id: demoId(`stage-change:${i}:${step}`),
        organizationId: orgId,
        dealId: dealIds[i],
        fromStatusId: previous,
        toStatusId: st.id,
        actorUserId: ownerId(deal.owner),
        lossReasonId: slug === "perdue" && deal.loss !== undefined ? lossReasonIds[deal.loss] : null,
        changedAt,
      });
      if (step > 0) {
        dealEventRows.push({ id: demoId(`deal-event:${i}:stage:${step}`), organizationId: orgId, dealId: dealIds[i], type: "status_changed", message: st.label, actorUserId: ownerId(deal.owner), createdAt: changedAt });
      }
      previous = st.id;
    });
  });
  await db.insert(s.deals).values(dealRows);
  await db.insert(s.dealStageChanges).values(stageRows);

  // ------------------------------------------------------------------ partages et commissions
  const shareIds = D.SHARES.map((_, i) => demoId(`share:${i}`));
  const shareRows: (typeof s.dealShares.$inferInsert)[] = [];
  const commissionRows: (typeof s.commissions.$inferInsert)[] = [];
  D.SHARES.forEach((share, i) => {
    const deal = D.DEALS[share.deal];
    const sentAt = at(share.ageDays, 11);
    const partner = D.PARTNERS[share.partner];
    const terms = share.commission.basis === "percentage" ? D.TEXTS.termsPercentage(share.commission.rate.toLocaleString("fr-FR")) : D.TEXTS.termsFixed(share.commission.amount);
    shareRows.push({
      id: shareIds[i],
      organizationId: orgId,
      dealId: dealIds[share.deal],
      partnerId: partnerIds[share.partner],
      tokenHash: hashShareToken(`clozado-demo:share:${i}`),
      status: share.status,
      proposedTerms: terms,
      message: D.TEXTS.shareMessage(partner.name.split(" ")[0], deal.title.toLowerCase()),
      expiresAt: share.expiresInDays === null ? null : new Date(sentAt.getTime() + share.expiresInDays * DAY),
      replacesShareId: share.reissuedFrom !== undefined ? shareIds[share.reissuedFrom] : null,
      sentAt,
      respondedAt: share.status === "accepted" || share.status === "declined" ? new Date(sentAt.getTime() + 2 * DAY) : null,
      revokedAt: share.status === "revoked" ? new Date(sentAt.getTime() + 20 * DAY) : null,
      createdBy: ownerId(deal.owner),
      createdAt: sentAt,
      updatedAt: sentAt,
    });
    const computed = share.commission.basis === "percentage" ? (deal.amount * share.commission.rate) / 100 : share.commission.amount;
    commissionRows.push({
      id: demoId(`commission:${i}`),
      organizationId: orgId,
      dealId: dealIds[share.deal],
      shareId: shareIds[i],
      basis: share.commission.basis,
      rate: share.commission.basis === "percentage" ? share.commission.rate.toFixed(2) : null,
      fixedAmount: share.commission.basis === "fixed" ? money(share.commission.amount) : null,
      baseAmount: money(deal.amount),
      computedAmount: money(computed),
      state: share.commissionState,
      confirmedAt: share.confirmedDaysAgo !== undefined ? at(share.confirmedDaysAgo, 15) : null,
      settledAt: share.settledDaysAgo !== undefined ? at(share.settledDaysAgo, 16) : null,
      createdAt: sentAt,
      updatedAt: share.settledDaysAgo !== undefined ? at(share.settledDaysAgo, 16) : share.confirmedDaysAgo !== undefined ? at(share.confirmedDaysAgo, 15) : sentAt,
    });
    dealEventRows.push({ id: demoId(`deal-event:share:${i}:sent`), organizationId: orgId, dealId: dealIds[share.deal], shareId: shareIds[i], type: "share_sent", message: partner.name, actorUserId: ownerId(deal.owner), createdAt: sentAt });
    if (share.viewed) dealEventRows.push({ id: demoId(`deal-event:share:${i}:viewed`), organizationId: orgId, dealId: dealIds[share.deal], shareId: shareIds[i], type: "share_viewed", message: null, actorPartnerId: partnerIds[share.partner], createdAt: new Date(sentAt.getTime() + 5 * 3600_000) });
    if (share.status === "accepted") dealEventRows.push({ id: demoId(`deal-event:share:${i}:accepted`), organizationId: orgId, dealId: dealIds[share.deal], shareId: shareIds[i], type: "share_accepted", message: D.TEXTS.shareAccepted, actorPartnerId: partnerIds[share.partner], createdAt: new Date(sentAt.getTime() + 2 * DAY) });
    if (share.status === "declined") dealEventRows.push({ id: demoId(`deal-event:share:${i}:declined`), organizationId: orgId, dealId: dealIds[share.deal], shareId: shareIds[i], type: "share_declined", message: D.TEXTS.shareDeclined, actorPartnerId: partnerIds[share.partner], createdAt: new Date(sentAt.getTime() + 2 * DAY) });
    if (share.status === "revoked") dealEventRows.push({ id: demoId(`deal-event:share:${i}:revoked`), organizationId: orgId, dealId: dealIds[share.deal], shareId: shareIds[i], type: "share_revoked", message: null, actorUserId: ownerId(deal.owner), createdAt: new Date(sentAt.getTime() + 20 * DAY) });
    if (share.confirmedDaysAgo !== undefined) dealEventRows.push({ id: demoId(`deal-event:share:${i}:confirmed`), organizationId: orgId, dealId: dealIds[share.deal], shareId: shareIds[i], type: "commission_updated", message: D.TEXTS.commissionConfirmed, actorUserId: ownerId(deal.owner), createdAt: at(share.confirmedDaysAgo, 15) });
    if (share.settledDaysAgo !== undefined) dealEventRows.push({ id: demoId(`deal-event:share:${i}:settled`), organizationId: orgId, dealId: dealIds[share.deal], shareId: shareIds[i], type: "commission_updated", message: D.TEXTS.commissionSettled, actorUserId: ownerId(deal.owner), createdAt: at(share.settledDaysAgo, 16) });
  });
  dealEventRows.push({ id: demoId("deal-event:comment:0"), organizationId: orgId, dealId: dealIds[12], shareId: shareIds[5], type: "commented", message: D.TEXTS.partnerComment, actorPartnerId: partnerIds[0], createdAt: at(4, 17) });
  await db.insert(s.dealShares).values(shareRows);
  await db.insert(s.commissions).values(commissionRows);
  await db.insert(s.dealEvents).values(dealEventRows);

  // ------------------------------------------------------------------ tâches, interactions, rendez-vous
  const taskRows: (typeof s.tasks.$inferInsert)[] = D.TASKS.map((task, i) => ({
    id: demoId(`task:${i}`),
    organizationId: orgId,
    title: task.title,
    notes: task.notes ?? null,
    dueAt: task.due === null ? null : dayStored(task.due),
    priority: task.priority ?? "normal",
    status: task.done ? "done" : "open",
    completedAt: task.done && task.due !== null ? new Date(dayStored(task.due).getTime() + 9 * 3600_000) : null,
    assigneeId: ownerId(task.owner),
    contactId: task.contact !== undefined ? contactIds[task.contact] : null,
    dealId: task.deal !== undefined ? dealIds[task.deal] : null,
    recurUnit: task.recurWeekly ? "week" : null,
    recurEvery: task.recurWeekly ? 1 : null,
    createdBy: ownerId(task.owner),
    createdAt: at(Math.max(1, (task.due ?? 0) < 0 ? -(task.due ?? 0) + 5 : 6 + (i % 5)), 8),
  }));
  await db.insert(s.tasks).values(taskRows);

  const activityRows: (typeof s.activities.$inferInsert)[] = [];
  let activityIndex = 0;
  const pushActivity = (contact: number, deal: number | null, type: "call" | "email" | "meeting" | "note", direction: "inbound" | "outbound" | null, content: string, occurredAt: Date, createdBy: string) => {
    activityRows.push({ id: demoId(`activity:${activityIndex++}`), organizationId: orgId, type, content, occurredAt, direction: type === "email" ? direction : null, contactId: contactIds[contact], dealId: deal !== null ? dealIds[deal] : null, createdBy, createdAt: occurredAt });
  };
  D.DEALS.forEach((deal, i) => {
    const owner = ownerId(deal.owner);
    const age = deal.ageDays;
    pushActivity(deal.contact, i, "meeting", null, D.ACTIVITY_LINES.meeting[i % 2], at(Math.max(1, age - 1), 14), owner);
    if (i % 2 === 0) pushActivity(deal.contact, i, "call", null, D.ACTIVITY_LINES.call[i % 4], at(Math.max(1, Math.floor(age / 2)), 11), owner);
    if (i % 3 === 0) pushActivity(deal.contact, i, "email", "outbound", D.ACTIVITY_LINES.emailOut[i % 3], at(Math.max(1, Math.floor(age / 3)), 16), owner);
    if (i % 4 === 1) pushActivity(deal.contact, i, "email", "inbound", D.ACTIVITY_LINES.emailIn[i % 3], at(Math.max(1, Math.floor(age / 4)), 9), owner);
  });
  for (let i = 22; i < 30; i++) pushActivity(i, null, "note", null, D.ACTIVITY_LINES.note[i % 3], at(10 + i, 10), contactOwner(i));
  const inboundActivityId = demoId("activity:inbound-confirmed");
  activityRows.push({ id: inboundActivityId, organizationId: orgId, type: "email", content: D.INBOUND[0].body, occurredAt: at(D.INBOUND[0].daysAgo, 9, 12), direction: "inbound", contactId: contactIds[D.INBOUND[0].contact!], dealId: dealIds[17], createdBy: claire, createdAt: at(D.INBOUND[0].daysAgo, 9, 15) });
  await db.insert(s.activities).values(activityRows);

  await db.insert(s.appointments).values(
    D.APPOINTMENTS.map((a, i) => {
      const startsAt = at(-a.inDays, a.hour);
      return {
        id: demoId(`appointment:${i}`),
        organizationId: orgId,
        contactId: contactIds[a.contact],
        userId: ownerId(a.owner),
        source: "manual",
        title: a.title,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 3600_000),
        status: a.canceled ? "canceled" : "scheduled",
        canceledAt: a.canceled ? at(1, 9) : null,
        createdBy: ownerId(a.owner),
        createdAt: at(Math.max(1, Math.abs(a.inDays) + 3), 9),
      };
    })
  );

  // ------------------------------------------------------------------ newsletters, envois, messages, événements
  const newsletterIds = D.NEWSLETTERS.map((_, i) => demoId(`newsletter:${i}`));
  const suppressed = new Set<string>();
  const suppressionRows: (typeof s.emailSuppressions.$inferInsert)[] = [];
  const messageRows: (typeof s.emailMessages.$inferInsert)[] = [];
  const eventLog: (typeof s.emailEvents.$inferInsert)[] = [];
  const sendRows: (typeof s.newsletterSends.$inferInsert)[] = [];
  const recipientRows: (typeof s.newsletterRecipients.$inferInsert)[] = [];
  const blockRows: (typeof s.newsletterBlocks.$inferInsert)[] = [];
  const newsletterRows: (typeof s.newsletters.$inferInsert)[] = [];
  const unopenedByNewsletter = new Map<number, number[]>();
  let eventIndex = 0;
  const pushEvent = (messageId: string, type: string, occurredAt: Date, url: string | null = null) => {
    eventLog.push({ id: demoId(`email-event:${eventIndex}`), organizationId: orgId, messageId, type, occurredAt, url, providerEventId: `demo-evt:${eventIndex}`, createdAt: occurredAt });
    eventIndex += 1;
  };
  const membersOf = (target: (typeof D.TARGETS)[number]) => contactRows.map((row, i) => ({ row, i })).filter(({ row, i }) => row.email && tagsOf(i).includes(target.tag));
  const byDate = [...D.NEWSLETTERS.map((n, i) => ({ n, i }))].sort((a, b) => (b.n.sentDaysAgo ?? -1) - (a.n.sentDaysAgo ?? -1));
  for (const { n, i } of byDate) {
    const target = D.TARGETS[n.target];
    const createdAt = n.sentDaysAgo === null ? at(2, 9) : at(n.sentDaysAgo + 3, 9);
    const sentAt = n.sentDaysAgo === null ? null : at(n.sentDaysAgo, 8, 30);
    const members = n.sentDaysAgo === null ? [] : membersOf(target).filter(({ row }) => !suppressed.has(row.email!));
    newsletterRows.push({
      id: newsletterIds[i],
      organizationId: orgId,
      title: n.title,
      targetId: targetIds[n.target],
      subject: n.subject,
      preheader: n.preheader,
      brief: n.brief,
      topics: [...n.topics],
      sentAt,
      sentMarkedBy: sentAt ? claire : null,
      sendMode: sentAt ? "sent" : null,
      audienceSnapshot: sentAt ? { targetId: targetIds[n.target], label: target.label, kind: "segment", criteria: { tagsAny: [tagIds[target.tag]], hasEmail: true }, summary: [D.TEXTS.audienceSummary(D.TAGS[target.tag].label)], count: members.length } : null,
      createdBy: claire,
      createdAt,
      updatedAt: sentAt ?? createdAt,
    });
    n.blocks.forEach((block, position) => {
      blockRows.push({ id: demoId(`block:${i}:${position}`), newsletterId: newsletterIds[i], type: block.type, position, payload: block.payload, createdAt, updatedAt: createdAt });
    });
    if (!sentAt) continue;
    const sendId = demoId(`send:${i}`);
    const html = n.blocks.map((b) => (b.type === "titre" ? `<h1>${b.payload.text}</h1>` : b.type === "texte" ? `<p>${b.payload.text}</p>` : b.type === "cta" ? `<p><a href="${b.payload.url}">${b.payload.buttonLabel}</a></p>` : "")).join("\n");
    const text = n.blocks.map((b) => (b.type === "titre" || b.type === "texte" ? b.payload.text : b.type === "cta" ? `${b.payload.buttonLabel} : ${b.payload.url}` : "")).filter(Boolean).join("\n\n");
    sendRows.push({ id: sendId, organizationId: orgId, newsletterId: newsletterIds[i], startedBy: claire, startedAt: sentAt, finishedAt: new Date(sentAt.getTime() + 90_000), queued: members.length, sent: members.length, failed: 0, subject: n.subject, html, textBody: text });
    const unopened: number[] = [];
    let bounces = n.stats.bounced;
    let unsubscribes = n.stats.unsubscribed;
    members.forEach(({ row, i: contactIndex }, k) => {
      const messageId = demoId(`message:${i}:${k}`);
      recipientRows.push({ organizationId: orgId, newsletterId: newsletterIds[i], contactId: row.id! });
      const queuedAt = sentAt;
      const msgSentAt = new Date(sentAt.getTime() + 20_000 + k * 700);
      const roll = random();
      const bounced = bounces > 0 && k % 7 === 5;
      if (bounced) bounces -= 1;
      const opened = !bounced && roll < n.stats.opened;
      const clicked = opened && random() < n.stats.clicked / n.stats.opened;
      const unsubscribed = opened && unsubscribes > 0 && k % 9 === 4;
      if (unsubscribed) unsubscribes -= 1;
      const deliveredAt = bounced ? null : new Date(msgSentAt.getTime() + 60_000 + Math.floor(random() * 120_000));
      const firstOpenedAt = opened ? new Date(deliveredAt!.getTime() + 3600_000 * (1 + Math.floor(random() * 30))) : null;
      const openCount = opened ? 1 + Math.floor(random() * 3) : 0;
      const lastOpenedAt = opened ? new Date(firstOpenedAt!.getTime() + (openCount - 1) * 5 * 3600_000) : null;
      const clickedAt = clicked ? new Date(firstOpenedAt!.getTime() + 120_000) : null;
      const status = bounced ? "bounced" : "delivered";
      messageRows.push({
        id: messageId,
        organizationId: orgId,
        kind: "newsletter",
        newsletterId: newsletterIds[i],
        sendId,
        contactId: row.id!,
        toEmail: row.email!,
        fromEmail: sender.from,
        replyTo: sender.replyTo,
        subject: n.subject,
        status,
        providerMessageId: `${DEMO_PROVIDER_PREFIX}${messageId}`,
        queuedAt,
        sentAt: msgSentAt,
        deliveredAt,
        firstOpenedAt,
        lastOpenedAt,
        openCount,
        firstClickedAt: clickedAt,
        lastClickedAt: clickedAt,
        clickCount: clicked ? 1 : 0,
        bouncedAt: bounced ? new Date(msgSentAt.getTime() + 90_000) : null,
        createdBy: claire,
        createdAt: queuedAt,
        updatedAt: lastOpenedAt ?? deliveredAt ?? msgSentAt,
      });
      pushEvent(messageId, "sent", msgSentAt);
      if (bounced) {
        pushEvent(messageId, "bounced", new Date(msgSentAt.getTime() + 90_000));
        suppressed.add(row.email!);
        suppressionRows.push({ organizationId: orgId, email: row.email!.toLowerCase(), reason: "bounced", source: "webhook", messageId, contactId: row.id!, createdAt: new Date(msgSentAt.getTime() + 90_000) });
      } else {
        pushEvent(messageId, "delivered", deliveredAt!);
        if (opened) {
          for (let o = 0; o < openCount; o++) pushEvent(messageId, "opened", new Date(firstOpenedAt!.getTime() + o * 5 * 3600_000));
          if (clicked) pushEvent(messageId, "clicked", clickedAt!, D.PEOPLE.claire.bookingUrl);
          if (unsubscribed) {
            pushEvent(messageId, "unsubscribed", new Date(firstOpenedAt!.getTime() + 300_000));
            suppressed.add(row.email!);
            suppressionRows.push({ organizationId: orgId, email: row.email!.toLowerCase(), reason: "unsubscribed", source: "link", messageId, contactId: row.id!, createdAt: new Date(firstOpenedAt!.getTime() + 300_000) });
          }
        } else {
          unopened.push(contactIndex);
        }
      }
    });
    unopenedByNewsletter.set(i, unopened);
  }
  await db.insert(s.newsletters).values(newsletterRows);
  await db.insert(s.newsletterBlocks).values(blockRows);
  await db.insert(s.newsletterSends).values(sendRows);
  await db.insert(s.newsletterRecipients).values(recipientRows);
  await db.insert(s.emailMessages).values(messageRows);
  await db.insert(s.emailEvents).values(eventLog);
  if (suppressionRows.length > 0) await db.insert(s.emailSuppressions).values(suppressionRows);

  // ------------------------------------------------------------------ règles, passages, journal, vague en attente
  const adminScope = { role: "admin" as const, organizationId: orgId };
  const ruleRecords: (typeof s.rules.$inferSelect)[] = [];
  for (const rule of D.RULES) {
    const created = await createRule(adminScope, claire, {
      name: rule.name,
      trigger: rule.trigger,
      thresholdDays: rule.thresholdDays,
      conditions: rule.conditions.tags?.length ? { tagsAny: rule.conditions.tags.map((t) => tagIds[t]) } : {},
      action: rule.action,
      templateSubject: "templateSubject" in rule ? rule.templateSubject : undefined,
      templateBody: "templateBody" in rule ? rule.templateBody : undefined,
    });
    ruleRecords.push(created);
  }
  await db.update(s.rules).set({ createdAt: at(40), lastRunAt: at(1, 6, 31) }).where(eq(s.rules.organizationId, orgId));
  const templates = await db.select().from(s.ruleTemplates).where(eq(s.ruleTemplates.organizationId, orgId));
  const draftTemplate = templates.find((t) => t.ruleId === ruleRecords[1].id)!;
  const runIds = [3, 2, 1].map((d) => demoId(`rule-run:${d}`));
  await db.insert(s.ruleRuns).values([
    { id: runIds[0], organizationId: orgId, trigger: "cron", startedAt: at(3, 6, 24), finishedAt: at(3, 6, 24, ), evaluated: 2, matched: 3, actionsDone: 2, actionsSkipped: 1 },
    { id: runIds[1], organizationId: orgId, trigger: "cron", startedAt: at(2, 6, 18), finishedAt: at(2, 6, 18), evaluated: 2, matched: 4, actionsDone: 2, actionsSkipped: 2 },
    { id: runIds[2], organizationId: orgId, trigger: "cron", startedAt: at(1, 6, 31), finishedAt: at(1, 6, 31), evaluated: 2, matched: 1, actionsDone: 0, actionsSkipped: 1 },
  ]);
  const ruleTaskContacts = [22, 23];
  const ruleTaskIds = ruleTaskContacts.map((c) => demoId(`rule-task:${c}`));
  await db.insert(s.tasks).values(
    ruleTaskContacts.map((c, k) => ({ id: ruleTaskIds[k], organizationId: orgId, title: ruleRecords[0].name, dueAt: dayStored(-3 + k), status: "open" as const, assigneeId: contactOwner(c), contactId: contactIds[c], ruleId: ruleRecords[0].id, createdBy: null, createdAt: at(3 - k, 6, 24) }))
  );
  const unopened = (unopenedByNewsletter.get(0) ?? []).filter((c) => !stoppedReasons.has(c)).slice(0, 3);
  const draftContacts = unopened.length >= 2 ? unopened.slice(0, 2) : [24, 25];
  const draftIds = draftContacts.map((c) => demoId(`draft:${c}`));
  const renderFor = (c: number, text: string) => {
    const row = contactRows[c];
    return renderRuleTemplate(text, {
      prenom: row.firstName ?? row.name,
      nom: row.lastName ?? "",
      nom_complet: row.name,
      societe: row.companyName ?? "",
      organisation: D.ORGANIZATION.name,
      expediteur: D.PEOPLE.claire.name,
      lien_rdv: D.PEOPLE.claire.bookingUrl,
    });
  };
  await db.insert(s.emailMessages).values([
    ...draftContacts.map((c, k) => ({
      id: draftIds[k],
      organizationId: orgId,
      kind: "automatic",
      ruleId: ruleRecords[1].id,
      contactId: contactIds[c],
      toEmail: contactRows[c].email!,
      fromEmail: sender.from,
      replyTo: sender.replyTo,
      subject: renderFor(c, draftTemplate.subject),
      body: renderFor(c, draftTemplate.body),
      status: "draft",
      createdBy: null,
      createdAt: at(2, 6, 18),
      updatedAt: at(2, 6, 18),
    })),
    {
      id: demoId("automatic:sent:0"),
      organizationId: orgId,
      kind: "automatic",
      ruleId: ruleRecords[1].id,
      contactId: contactIds[26],
      toEmail: contactRows[26].email!,
      fromEmail: sender.from,
      replyTo: sender.replyTo,
      subject: renderFor(26, draftTemplate.subject),
      body: renderFor(26, draftTemplate.body),
      status: "delivered",
      providerMessageId: `${DEMO_PROVIDER_PREFIX}${demoId("automatic:sent:0")}`,
      queuedAt: at(12, 9, 5),
      sentAt: at(12, 9, 6),
      deliveredAt: at(12, 9, 7),
      firstOpenedAt: at(12, 11),
      lastOpenedAt: at(12, 11),
      openCount: 1,
      createdBy: claire,
      createdAt: at(13, 6, 20),
      updatedAt: at(12, 11),
    },
  ]);
  await db.insert(s.ruleActions).values([
    { organizationId: orgId, runId: runIds[0], ruleId: ruleRecords[0].id, contactId: contactIds[22], action: "create_task", outcome: "done", taskId: ruleTaskIds[0], occurredAt: at(3, 6, 24) },
    { organizationId: orgId, runId: runIds[0], ruleId: ruleRecords[0].id, contactId: contactIds[38], action: "create_task", outcome: "skipped", skipReason: "no_owner", occurredAt: at(3, 6, 24) },
    { organizationId: orgId, runId: runIds[0], ruleId: ruleRecords[1].id, contactId: contactIds[26], action: "prepare_draft", outcome: "done", messageId: demoId("automatic:sent:0"), templateId: draftTemplate.id, occurredAt: at(3, 6, 24) },
    { organizationId: orgId, runId: runIds[1], ruleId: ruleRecords[0].id, contactId: contactIds[23], action: "create_task", outcome: "done", taskId: ruleTaskIds[1], occurredAt: at(2, 6, 18) },
    { organizationId: orgId, runId: runIds[1], ruleId: ruleRecords[0].id, contactId: contactIds[22], action: "create_task", outcome: "skipped", skipReason: "open_task", occurredAt: at(2, 6, 18) },
    ...draftContacts.map((c, k) => ({ organizationId: orgId, runId: runIds[1], ruleId: ruleRecords[1].id, contactId: contactIds[c], action: "prepare_draft", outcome: "done", messageId: draftIds[k], templateId: draftTemplate.id, occurredAt: at(2, 6, 18) })),
    { organizationId: orgId, runId: runIds[1], ruleId: ruleRecords[1].id, contactId: contactIds[38], action: "prepare_draft", outcome: "skipped", skipReason: "no_email", occurredAt: at(2, 6, 18) },
    { organizationId: orgId, runId: runIds[2], ruleId: ruleRecords[0].id, contactId: contactIds[22], action: "create_task", outcome: "skipped", skipReason: "open_task", occurredAt: at(1, 6, 31) },
  ]);

  // ------------------------------------------------------------------ emails reçus
  await db.insert(s.inboundEmails).values(
    D.INBOUND.map((m, i) => ({
      id: demoId(`inbound:${i}`),
      organizationId: orgId,
      providerEmailId: `demo-inbound:${demoId(`inbound:${i}`)}`,
      messageIdHeader: `<demo-${i}@${DEMO_DOMAIN}>`,
      receivedAt: at(m.daysAgo, 9, 12),
      senderEmail: D.PEOPLE.claire.email,
      senderUserId: claire,
      authResult: "dkim_aligned",
      authDetail: { dkim: [{ domain: DEMO_DOMAIN, selector: "demo", status: "pass", code: null, aligned: true }], spf: { ip: "203.0.113.10", domain: DEMO_DOMAIN, result: "pass" } },
      status: m.kind,
      mode: "forward",
      subject: m.subject,
      counterpartEmail: m.contact !== null ? contactRows[m.contact].email : m.counterpartEmail,
      counterpartName: m.counterpartName,
      originalDate: at(m.daysAgo, 8, 40),
      contactId: m.contact !== null ? contactIds[m.contact] : null,
      activityId: m.kind === "confirmed" ? inboundActivityId : null,
      proposal: { name: m.proposal.name ? { value: m.proposal.name, confidence: 0.92 } : null, phone: m.proposal.phone ? { value: m.proposal.phone, confidence: 0.88 } : null, company: m.proposal.company ? { value: m.proposal.company, confidence: 0.8 } : null, jobTitle: m.proposal.jobTitle ? { value: m.proposal.jobTitle, confidence: 0.75 } : null, source: "deterministic", model: null },
      bodyText: m.body,
      sizeBytes: 2400 + i * 310,
      confirmedBy: m.kind === "pending" ? null : claire,
      confirmedAt: m.kind === "pending" ? null : at(m.daysAgo, 9, 40),
      createdAt: at(m.daysAgo, 9, 12),
    }))
  );

  // ------------------------------------------------------------------ veille, concurrents, indicateurs
  const topicIds = D.WATCH_TOPICS.map((_, i) => demoId(`topic:${i}`));
  const sourceIds = D.WATCH_SOURCES.map((_, i) => demoId(`source:${i}`));
  const competitorIds = D.COMPETITORS.map((_, i) => demoId(`competitor:${i}`));
  await db.insert(s.watchTopics).values(D.WATCH_TOPICS.map((t, i) => ({ id: topicIds[i], organizationId: orgId, label: t.label, searchTerms: [...t.searchTerms], searchLanguages: ["fr"], position: t.position, lastSearchedAt: at(2, 5, 40), createdAt: at(60) })));
  await db.insert(s.watchSources).values([
    ...D.WATCH_SOURCES.map((src, i) => ({ id: sourceIds[i], organizationId: orgId, kind: "source", label: src.label, siteUrl: src.siteUrl, feedUrl: src.feedUrl, country: "FR", lang: "fr", topicId: topicIds[src.topic], lastFetchedAt: at(2, 5, 41), lastOkAt: at(2, 5, 41), position: i, createdAt: at(60) })),
    ...D.COMPETITORS.map((c, i) => ({ id: competitorIds[i], organizationId: orgId, kind: "competitor", label: c.label, siteUrl: c.siteUrl, feedUrl: c.feedUrl, country: "FR", lang: "fr", lastFetchedAt: at(2, 5, 42), lastOkAt: at(2, 5, 42), position: i, createdAt: at(55) })),
  ]);
  const itemInputs: NewWatchItemInput[] = D.WATCH_ITEMS.map((item) => ({
    title: item.title,
    url: item.url,
    publisher: item.publisher,
    publishedAt: at(item.daysAgo, 7),
    country: "FR",
    lang: "fr",
    sourceId: item.competitor !== undefined ? competitorIds[item.competitor] : item.source !== null ? sourceIds[item.source] : null,
    topicId: item.topic !== null ? topicIds[item.topic] : null,
    discoveredVia: "feed",
  }));
  await insertWatchItems(orgId, itemInputs);
  const insertedItems = await db.select({ id: s.watchItems.id, title: s.watchItems.title }).from(s.watchItems).where(eq(s.watchItems.organizationId, orgId));
  for (const item of D.WATCH_ITEMS) {
    const row = insertedItems.find((r) => r.title === item.title);
    if (!row) continue;
    await db
      .update(s.watchItems)
      .set({ summary: item.summary, summaryState: "done", summaryModel: "demo", themes: [...item.themes], angle: item.angle, discoveredAt: at(item.daysAgo, 5, 45) })
      .where(and(eq(s.watchItems.id, row.id), eq(s.watchItems.organizationId, orgId)));
  }
  const basketItem = insertedItems.find((r) => r.title === D.WATCH_ITEMS[2].title);
  if (basketItem) await db.insert(s.watchBasketItems).values({ organizationId: orgId, itemId: basketItem.id, addedBy: claire, addedAt: at(1, 9) });
  await db.insert(s.watchRuns).values([
    { id: demoId("watch-run:3"), organizationId: orgId, trigger: "cron", startedAt: at(3, 5, 38), finishedAt: at(3, 5, 39), sourcesOk: 7, sourcesFailed: 0, itemsNew: 4, itemsSummarized: 4 },
    { id: demoId("watch-run:2"), organizationId: orgId, trigger: "cron", startedAt: at(2, 5, 40), finishedAt: at(2, 5, 41), sourcesOk: 7, sourcesFailed: 0, itemsNew: 6, itemsSummarized: 6 },
  ]);
  await followIndicators(orgId, D.INDICATOR_KEYS);

  return { organizationId: orgId, counts: await countDemoRows(orgId) };
}
