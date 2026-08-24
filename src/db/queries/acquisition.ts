import { and, asc, count, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  acquisitionEvents,
  acquisitionRejections,
  apiKeys,
  contacts,
  dealEvents,
  deals,
  leads,
  organizations,
  origins,
  siteKeys,
  type AcquisitionEvent,
  type Contact,
  type Lead,
} from "@/db/schema";
import { assertOrgAccess } from "@/db/scope";
import { generateApiKey, generateSiteKey, hashApiKey, normalizeDomain } from "@/lib/acquisition/keys";
import type { OrgScopeUser } from "@/lib/session";

/**
 * La collecte d'acquisition : origines configurées et débordement libre,
 * clés d'API (serveur) et clés de site (navigateur), réception des leads
 * et des événements, refus comptés, origine des affaires. Tout est borné
 * par une organisation : les fonctions publiques (routes sans session)
 * reçoivent l'organisation résolue depuis une clé, jamais fournie par
 * l'appelant ; les fonctions d'écran passent par `assertOrgAccess`.
 */

function requireOrganization(user: OrgScopeUser): string {
  if (!user.organizationId) {
    throw new Error("Aucune organisation sélectionnée. Choisis une organisation dans le bandeau super admin en haut de l'écran.");
  }
  return user.organizationId;
}

// ---------------------------------------------------------------------------
// Origines : la liste configurée, et le rapprochement du débordement libre
// ---------------------------------------------------------------------------

export async function listOrigins(user: OrgScopeUser) {
  const org = requireOrganization(user);
  return db.select().from(origins).where(eq(origins.organizationId, org)).orderBy(asc(origins.position), asc(origins.label));
}

export async function createOrigin(user: OrgScopeUser, label: string) {
  const org = requireOrganization(user);
  const trimmed = label.trim();
  if (!trimmed) throw new Error("Le libellé de l'origine est obligatoire.");
  const [existing] = await db
    .select()
    .from(origins)
    .where(and(eq(origins.organizationId, org), sql`lower(${origins.label}) = ${trimmed.toLowerCase()}`))
    .limit(1);
  if (existing) return existing;
  const [created] = await db.insert(origins).values({ organizationId: org, label: trimmed }).returning();
  return created;
}

/** Texte reçu → origine configurée (libellé, insensible à la casse) ou débordement libre. */
export async function matchOrigin(organizationId: string, raw: string | null): Promise<{ originId: string | null; originRaw: string | null }> {
  const trimmed = raw?.trim().slice(0, 200) || null;
  if (!trimmed) return { originId: null, originRaw: null };
  const [found] = await db
    .select({ id: origins.id })
    .from(origins)
    .where(and(eq(origins.organizationId, organizationId), sql`lower(${origins.label}) = ${trimmed.toLowerCase()}`))
    .limit(1);
  return { originId: found?.id ?? null, originRaw: trimmed };
}

export type UnmatchedOrigin = { raw: string; leads: number; events: number; lastSeenAt: Date };

/** Le débordement : les textes d'origine reçus qui ne correspondent à aucune ligne configurée, avec leur poids. */
export async function listUnmatchedOrigins(user: OrgScopeUser): Promise<UnmatchedOrigin[]> {
  const org = requireOrganization(user);
  const rows = await db.execute(sql`
    SELECT raw, sum(leads)::int AS leads, sum(events)::int AS events, max(last_seen) AS last_seen
    FROM (
      SELECT origin_raw AS raw, count(*) AS leads, 0 AS events, max(received_at) AS last_seen
      FROM leads WHERE organization_id = ${org} AND origin_id IS NULL AND origin_raw IS NOT NULL GROUP BY origin_raw
      UNION ALL
      SELECT origin_raw, 0, count(*), max(occurred_at)
      FROM acquisition_events WHERE organization_id = ${org} AND origin_id IS NULL AND origin_raw IS NOT NULL GROUP BY origin_raw
    ) u
    GROUP BY raw
    ORDER BY sum(leads) DESC, sum(events) DESC, raw
    LIMIT 200
  `);
  return (rows.rows as Record<string, unknown>[]).map((r) => ({
    raw: String(r.raw),
    leads: Number(r.leads) || 0,
    events: Number(r.events) || 0,
    lastSeenAt: new Date(String(r.last_seen)),
  }));
}

/**
 * Rattache un texte reçu à une origine (existante ou créée) — et
 * RÉTROACTIVEMENT : tous les leads et événements qui portent ce texte sans
 * origine passent sous cette origine. Le texte reste en `origin_raw`
 * (on sait d'où vient le rattachement).
 */
export async function attachOrigin(
  user: OrgScopeUser,
  raw: string,
  target: { originId: string } | { newLabel: string }
) {
  const org = requireOrganization(user);
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("Texte d'origine vide.");
  let originId: string;
  if ("originId" in target) {
    const [origin] = await db.select().from(origins).where(and(eq(origins.id, target.originId), eq(origins.organizationId, org)));
    if (!origin) throw new Error("Origine introuvable pour cette organisation.");
    originId = origin.id;
  } else {
    originId = (await createOrigin(user, target.newLabel)).id;
  }
  const [leadRows, eventRows] = await Promise.all([
    db
      .update(leads)
      .set({ originId })
      .where(and(eq(leads.organizationId, org), isNull(leads.originId), eq(leads.originRaw, trimmed)))
      .returning({ id: leads.id }),
    db
      .update(acquisitionEvents)
      .set({ originId })
      .where(and(eq(acquisitionEvents.organizationId, org), isNull(acquisitionEvents.originId), eq(acquisitionEvents.originRaw, trimmed)))
      .returning({ id: acquisitionEvents.id }),
  ]);
  return { originId, leadsUpdated: leadRows.length, eventsUpdated: eventRows.length };
}

/** Les affaires sans origine dont le contact a pourtant un lead — le cas « créée à la main, lead identifié après coup ». */
export async function listDealsWithoutOriginButLeads(user: OrgScopeUser) {
  const org = requireOrganization(user);
  return db
    .select({
      dealId: deals.id,
      title: deals.title,
      contactId: deals.contactId,
      contactName: contacts.name,
      createdAt: deals.createdAt,
      leadCount: count(leads.id),
    })
    .from(deals)
    .innerJoin(contacts, eq(deals.contactId, contacts.id))
    .innerJoin(leads, and(eq(leads.contactId, contacts.id), eq(leads.organizationId, org)))
    .where(and(eq(deals.organizationId, org), isNull(deals.leadId)))
    .groupBy(deals.id, deals.title, deals.contactId, contacts.name, deals.createdAt)
    .orderBy(desc(deals.createdAt))
    .limit(100);
}

// ---------------------------------------------------------------------------
// Clés d'API (serveur → /api/leads)
// ---------------------------------------------------------------------------

export async function listApiKeys(user: OrgScopeUser) {
  const org = requireOrganization(user);
  return db
    .select({
      id: apiKeys.id,
      label: apiKeys.label,
      keyPrefix: apiKeys.keyPrefix,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.organizationId, org))
    .orderBy(desc(apiKeys.createdAt));
}

/** Crée une clé et renvoie sa valeur EN CLAIR — une seule fois, jamais récupérable ensuite. */
export async function createApiKey(user: OrgScopeUser, createdBy: string, label: string) {
  const org = requireOrganization(user);
  if (user.role !== "admin") throw new Error("Réservé à l'admin de l'organisation.");
  const trimmed = label.trim();
  if (!trimmed) throw new Error("Donne un nom à la clé (où elle sera utilisée).");
  const { key, prefix, hash } = generateApiKey();
  const [row] = await db
    .insert(apiKeys)
    .values({ organizationId: org, label: trimmed, keyPrefix: prefix, keyHash: hash, createdBy })
    .returning();
  return { key, row };
}

export async function revokeApiKey(user: OrgScopeUser, id: string) {
  const org = requireOrganization(user);
  if (user.role !== "admin") throw new Error("Réservé à l'admin de l'organisation.");
  await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.organizationId, org), isNull(apiKeys.revokedAt)));
}

export type ApiKeyAuth =
  | { ok: true; organizationId: string; apiKeyId: string; keyPrefix: string }
  | { ok: false; reason: "unknown" }
  | { ok: false; reason: "revoked"; organizationId: string; keyPrefix: string };

/** Authentifie une clé présentée (Authorization: Bearer) — recherche par empreinte, jamais par la clé. */
export async function authenticateApiKey(rawKey: string): Promise<ApiKeyAuth> {
  const [row] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, hashApiKey(rawKey))).limit(1);
  if (!row) return { ok: false, reason: "unknown" };
  if (row.revokedAt) return { ok: false, reason: "revoked", organizationId: row.organizationId, keyPrefix: row.keyPrefix };
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, row.id));
  return { ok: true, organizationId: row.organizationId, apiKeyId: row.id, keyPrefix: row.keyPrefix };
}

// ---------------------------------------------------------------------------
// Clés de site (navigateur → /api/events) et domaines autorisés
// ---------------------------------------------------------------------------

export async function listSiteKeys(user: OrgScopeUser) {
  const org = requireOrganization(user);
  return db.select().from(siteKeys).where(eq(siteKeys.organizationId, org)).orderBy(desc(siteKeys.createdAt));
}

export async function createSiteKey(user: OrgScopeUser, label: string) {
  const org = requireOrganization(user);
  if (user.role !== "admin") throw new Error("Réservé à l'admin de l'organisation.");
  const [row] = await db
    .insert(siteKeys)
    .values({ organizationId: org, key: generateSiteKey(), label: label.trim() || "Site principal" })
    .returning();
  return row;
}

export async function revokeSiteKey(user: OrgScopeUser, id: string) {
  const org = requireOrganization(user);
  if (user.role !== "admin") throw new Error("Réservé à l'admin de l'organisation.");
  const active = await db.select({ id: siteKeys.id }).from(siteKeys).where(and(eq(siteKeys.organizationId, org), isNull(siteKeys.revokedAt)));
  if (active.length <= 1 && active.some((k) => k.id === id)) {
    throw new Error("Crée d'abord une nouvelle clé de site : révoquer la dernière active couperait toute collecte.");
  }
  await db
    .update(siteKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(siteKeys.id, id), eq(siteKeys.organizationId, org), isNull(siteKeys.revokedAt)));
}

export type SiteKeyResolution =
  | { ok: true; organizationId: string; siteKeyId: string; allowedDomains: string[] }
  | { ok: false; reason: "unknown" }
  | { ok: false; reason: "revoked"; organizationId: string };

/** Résout une clé de site publique — seule entrée de /api/events, jamais un id d'organisation. */
export async function resolveSiteKey(key: string): Promise<SiteKeyResolution> {
  const [row] = await db
    .select({ id: siteKeys.id, organizationId: siteKeys.organizationId, revokedAt: siteKeys.revokedAt, allowedDomains: organizations.allowedDomains })
    .from(siteKeys)
    .innerJoin(organizations, eq(siteKeys.organizationId, organizations.id))
    .where(eq(siteKeys.key, key))
    .limit(1);
  if (!row) return { ok: false, reason: "unknown" };
  if (row.revokedAt) return { ok: false, reason: "revoked", organizationId: row.organizationId };
  return { ok: true, organizationId: row.organizationId, siteKeyId: row.id, allowedDomains: row.allowedDomains };
}

/** Un domaine par ligne, normalisé (hôte, port éventuel, sans schéma ni chemin) ; les illisibles sont ignorés. */
export async function updateAllowedDomains(user: OrgScopeUser, input: string[]) {
  const org = requireOrganization(user);
  if (user.role !== "admin") throw new Error("Réservé à l'admin de l'organisation.");
  const domains = [...new Set(input.map(normalizeDomain).filter((d): d is string => Boolean(d)))];
  await db.update(organizations).set({ allowedDomains: domains, updatedAt: new Date() }).where(eq(organizations.id, org));
  return domains;
}

// ---------------------------------------------------------------------------
// Refus comptés
// ---------------------------------------------------------------------------

export type RejectionReason =
  | "domain_not_allowed"
  | "origin_missing"
  | "site_key_revoked"
  | "api_key_revoked"
  | "rate_limited"
  | "payload_too_large"
  | "invalid_payload";

/** Un compteur par (organisation, motif, détail) — jamais une ligne par requête. */
export async function recordRejection(organizationId: string, reason: RejectionReason, detail: string) {
  const d = detail.slice(0, 200) || "(absent)";
  await db
    .insert(acquisitionRejections)
    .values({ organizationId, reason, detail: d })
    .onConflictDoUpdate({
      target: [acquisitionRejections.organizationId, acquisitionRejections.reason, acquisitionRejections.detail],
      set: { count: sql`${acquisitionRejections.count} + 1`, lastSeenAt: new Date() },
    });
}

export async function listRejections(user: OrgScopeUser) {
  const org = requireOrganization(user);
  return db
    .select()
    .from(acquisitionRejections)
    .where(eq(acquisitionRejections.organizationId, org))
    .orderBy(desc(acquisitionRejections.lastSeenAt))
    .limit(50);
}

// ---------------------------------------------------------------------------
// Réception des leads
// ---------------------------------------------------------------------------

export type LeadInput = {
  email: string | null;
  phone: string | null;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  jobTitle: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  origin: string | null;
  simulator: string | null;
  pageUrl: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  visitorId: string | null;
  simulationStartedAt: Date | null;
  simulationCompletedAt: Date | null;
  payload: unknown;
};

/** Les champs qu'un lead peut remplir sur une fiche existante — jamais name/email (l'identité qui a servi à apparier). */
const LEAD_COMPLETABLE: { field: keyof Contact & keyof LeadInput; label: string }[] = [
  { field: "firstName", label: "prénom" },
  { field: "lastName", label: "nom" },
  { field: "phone", label: "téléphone" },
  { field: "companyName", label: "société" },
  { field: "jobTitle", label: "fonction" },
  { field: "city", label: "ville" },
  { field: "postalCode", label: "code postal" },
  { field: "country", label: "pays" },
];

export type ReceivedLead = { leadId: string; contactId: string; matchedExistingContact: boolean; enrichedFields: string[] };

/**
 * Un lead crée ou COMPLÈTE la fiche (email connu ⇒ compléter les champs
 * vides, jamais écraser, jamais name/email — même règle que l'import) et
 * s'enregistre avec son origine. `matched_existing_contact` et
 * `enriched_fields` gardent la trace de l'enrichissement pour le journal.
 * L'origine reçue est rattachée à une origine configurée si son libellé
 * correspond ; sinon le texte reste en débordement (`origin_raw`), à
 * rapprocher ensuite. Sans texte d'origine, le simulateur puis la source
 * UTM servent de débordement, pour que quelque chose remonte.
 */
export async function receiveLead(organizationId: string, apiKeyId: string, input: LeadInput): Promise<ReceivedLead> {
  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone?.trim() || null;
  if (!email && !phone) throw new Error("Un lead porte au moins un email ou un téléphone.");

  const derivedName =
    input.name?.trim() ||
    [input.firstName?.trim(), input.lastName?.trim()].filter(Boolean).join(" ") ||
    email?.split("@")[0] ||
    phone!;

  let contact: Contact | undefined;
  let matched = false;
  const enriched: string[] = [];
  if (email) {
    const candidates = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.organizationId, organizationId), isNull(contacts.deletedAt), sql`lower(${contacts.email}) = ${email}`))
      .orderBy(asc(contacts.createdAt))
      .limit(2);
    // Plusieurs fiches pour un email : on complète la plus ancienne (celle que l'import aurait départagée à la main).
    contact = candidates[0];
  }

  if (contact) {
    matched = true;
    const updates: Partial<Record<string, string>> = {};
    for (const { field, label } of LEAD_COMPLETABLE) {
      const incoming = (input[field] as string | null)?.trim();
      if (incoming && !contact[field]) {
        updates[field] = incoming;
        enriched.push(label);
      }
    }
    if (enriched.length > 0) {
      await db.update(contacts).set({ ...updates, updatedAt: new Date() }).where(eq(contacts.id, contact.id));
    }
  } else {
    [contact] = await db
      .insert(contacts)
      .values({
        organizationId,
        kind: "person",
        name: derivedName.slice(0, 200),
        firstName: input.firstName?.trim() || null,
        lastName: input.lastName?.trim() || null,
        email,
        phone,
        companyName: input.companyName?.trim() || null,
        jobTitle: input.jobTitle?.trim() || null,
        city: input.city?.trim() || null,
        postalCode: input.postalCode?.trim() || null,
        country: input.country?.trim() || null,
        source: "lead",
      })
      .returning();
  }

  const originText = input.origin?.trim() || input.simulator?.trim() || input.utmSource?.trim() || null;
  const origin = await matchOrigin(organizationId, originText);
  const [lead] = await db
    .insert(leads)
    .values({
      organizationId,
      contactId: contact.id,
      apiKeyId,
      visitorId: input.visitorId,
      simulator: input.simulator,
      pageUrl: input.pageUrl,
      referrer: input.referrer,
      utmSource: input.utmSource,
      utmMedium: input.utmMedium,
      utmCampaign: input.utmCampaign,
      originId: origin.originId,
      originRaw: origin.originRaw,
      simulationStartedAt: input.simulationStartedAt,
      simulationCompletedAt: input.simulationCompletedAt,
      payload: input.payload ?? null,
      matchedExistingContact: matched,
      enrichedFields: enriched,
    })
    .returning();
  return { leadId: lead.id, contactId: contact.id, matchedExistingContact: matched, enrichedFields: enriched };
}

// ---------------------------------------------------------------------------
// Réception des événements de visite et de simulation
// ---------------------------------------------------------------------------

export type EventInput = {
  kind: AcquisitionEvent["kind"];
  visitorId: string;
  occurredAt: Date | null;
  pageUrl: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  simulator: string | null;
  origin: string | null;
};

export async function receiveEvents(organizationId: string, events: EventInput[]): Promise<number> {
  if (events.length === 0) return 0;
  const values = [];
  for (const e of events) {
    const origin = await matchOrigin(organizationId, e.origin?.trim() || e.simulator?.trim() || e.utmSource?.trim() || null);
    values.push({
      organizationId,
      kind: e.kind,
      visitorId: e.visitorId,
      occurredAt: e.occurredAt ?? new Date(),
      pageUrl: e.pageUrl,
      referrer: e.referrer,
      utmSource: e.utmSource,
      utmMedium: e.utmMedium,
      utmCampaign: e.utmCampaign,
      simulator: e.simulator,
      originId: origin.originId,
      originRaw: origin.originRaw,
    });
  }
  const inserted = await db.insert(acquisitionEvents).values(values).returning({ id: acquisitionEvents.id });
  return inserted.length;
}

// ---------------------------------------------------------------------------
// État de la collecte (réglages)
// ---------------------------------------------------------------------------

export async function getCollectionStatus(user: OrgScopeUser) {
  const org = requireOrganization(user);
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const [[visits], [simulations], [leadRows], [lastVisit], [lastLead], rejections] = await Promise.all([
    db.select({ n: count() }).from(acquisitionEvents).where(and(eq(acquisitionEvents.organizationId, org), eq(acquisitionEvents.kind, "visit"), gte(acquisitionEvents.occurredAt, since))),
    db.select({ n: count() }).from(acquisitionEvents).where(and(eq(acquisitionEvents.organizationId, org), inArray(acquisitionEvents.kind, ["simulation_started", "simulation_completed"]), gte(acquisitionEvents.occurredAt, since))),
    db.select({ n: count() }).from(leads).where(and(eq(leads.organizationId, org), gte(leads.receivedAt, since))),
    db.select({ at: sql<Date | null>`max(${acquisitionEvents.occurredAt})` }).from(acquisitionEvents).where(eq(acquisitionEvents.organizationId, org)),
    db.select({ at: sql<Date | null>`max(${leads.receivedAt})` }).from(leads).where(eq(leads.organizationId, org)),
    listRejections(user),
  ]);
  return {
    visits30d: visits?.n ?? 0,
    simulations30d: simulations?.n ?? 0,
    leads30d: leadRows?.n ?? 0,
    lastEventAt: lastVisit?.at ? new Date(lastVisit.at) : null,
    lastLeadAt: lastLead?.at ? new Date(lastLead.at) : null,
    rejections,
  };
}

// ---------------------------------------------------------------------------
// L'origine d'une affaire
// ---------------------------------------------------------------------------

export type LeadSummary = Pick<Lead, "id" | "receivedAt" | "simulator" | "originRaw" | "utmSource" | "pageUrl"> & { originLabel: string | null };

/** Les leads d'un contact, les plus récents d'abord — pour le champ Origine d'une affaire et le journal. */
export async function listLeadsForContact(user: OrgScopeUser, contactId: string): Promise<LeadSummary[]> {
  const contact = await db.query.contacts.findFirst({ where: eq(contacts.id, contactId) });
  if (!contact) throw new Error("Contact introuvable.");
  assertOrgAccess(user, contact.organizationId);
  return db
    .select({
      id: leads.id,
      receivedAt: leads.receivedAt,
      simulator: leads.simulator,
      originRaw: leads.originRaw,
      utmSource: leads.utmSource,
      pageUrl: leads.pageUrl,
      originLabel: origins.label,
    })
    .from(leads)
    .leftJoin(origins, eq(leads.originId, origins.id))
    .where(and(eq(leads.contactId, contactId), eq(leads.organizationId, contact.organizationId)))
    .orderBy(desc(leads.receivedAt));
}

/** Le lead le plus récent d'un contact reçu AVANT un instant — la règle de création d'une affaire. */
export async function latestLeadBefore(organizationId: string, contactId: string, before: Date): Promise<string | null> {
  const [row] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.organizationId, organizationId), eq(leads.contactId, contactId), lt(leads.receivedAt, before)))
    .orderBy(desc(leads.receivedAt))
    .limit(1);
  return row?.id ?? null;
}

/** Libellé d'un lead pour le journal et le champ Origine : l'origine configurée, sinon le texte reçu, sinon le simulateur. */
export function leadOriginLabel(lead: { originLabel: string | null; originRaw: string | null; simulator: string | null }): string {
  return lead.originLabel ?? lead.originRaw ?? lead.simulator ?? "origine non renseignée";
}

/**
 * Rattache (ou détache) à la main l'origine d'une affaire — le geste
 * journalisé (`origin_changed`) qui couvre « affaire créée à la main, lead
 * identifié après coup ». Le lead doit appartenir au contact de l'affaire.
 */
export async function setDealOrigin(user: OrgScopeUser, actorUserId: string, dealId: string, leadId: string | null) {
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  if (!deal) throw new Error("Affaire introuvable.");
  assertOrgAccess(user, deal.organizationId);
  if (deal.leadId === leadId) return deal;

  let message = "Origine détachée";
  if (leadId) {
    const [lead] = await db
      .select({ id: leads.id, contactId: leads.contactId, originRaw: leads.originRaw, simulator: leads.simulator, originLabel: origins.label, receivedAt: leads.receivedAt })
      .from(leads)
      .leftJoin(origins, eq(leads.originId, origins.id))
      .where(and(eq(leads.id, leadId), eq(leads.organizationId, deal.organizationId)));
    if (!lead) throw new Error("Lead introuvable pour cette organisation.");
    if (!deal.contactId || lead.contactId !== deal.contactId) {
      throw new Error("Ce lead n'appartient pas au contact de cette affaire.");
    }
    message = `Origine rattachée : ${leadOriginLabel(lead)}`;
  }

  await db.batch([
    db.update(deals).set({ leadId, updatedAt: new Date() }).where(eq(deals.id, dealId)),
    db.insert(dealEvents).values({
      organizationId: deal.organizationId,
      dealId,
      type: "origin_changed",
      message,
      actorUserId,
    }),
  ]);
  return { ...deal, leadId };
}

/** Purge RGPD à la suppression d'un contact : les réponses de la simulation et le lien de navigation partent, l'attribution reste. */
export async function purgeLeadsPersonalData(contactId: string) {
  await db.update(leads).set({ payload: null, visitorId: null }).where(eq(leads.contactId, contactId));
}
