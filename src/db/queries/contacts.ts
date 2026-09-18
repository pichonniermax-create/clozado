import { and, asc, count, desc, eq, gt, ilike, inArray, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  appointments,
  contactAccessLog,
  contacts,
  contactTagAssignments,
  contactTags,
  deals,
  dealStatuses,
  emailEvents,
  emailMessages,
  inboundEmails,
  leads,
  mailTargetMembers,
  newsletterRecipients,
  origins,
  partners,
  ruleActions,
  tasks,
  users,
  type Contact,
} from "@/db/schema";
import { assertOrgAccess, assertUserInOrg, orgScope } from "@/db/scope";
import { dateBounds, filtersToSql, listOverSet, type FilterTarget } from "./filter-sql";
import type { FilterCondition } from "@/lib/display/filters";
import { PRODUCT_TIMEZONE } from "@/lib/timezone";
import type { OrgScopeUser } from "@/lib/session";
import { nameCityKey, phoneKey } from "@/lib/contacts/match-keys";
import { displayNameAfterUpdate } from "@/lib/contacts/display-name";
import { listOpenTasksForContact } from "./tasks";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";
import type { TranslatorOf } from "@/i18n/translator";

/** Taille de page de la liste — côté serveur, jamais la table entière en mémoire. */
export const CONTACTS_PAGE_SIZE = 50;

/**
 * LES CHAMPS FILTRABLES DES CONTACTS, traduits en SQL (lot 3). Chaque
 * cible ne parle que de la table `contacts` — le compte de la liste se
 * fait par une requête sans jointure, une condition qui parlerait
 * d'ailleurs ferait diverger le compte et la page.
 */
export const CONTACT_FILTER_TARGETS: Record<string, FilterTarget> = {
  nom: { kind: "column", type: "texte", column: contacts.name },
  email: { kind: "column", type: "texte", column: contacts.email },
  telephone: { kind: "column", type: "texte", column: contacts.phone },
  societe: { kind: "column", type: "texte", column: contacts.companyName },
  ville: { kind: "column", type: "texte", column: contacts.city },
  codepostal: { kind: "column", type: "texte", column: contacts.postalCode },
  nature: { kind: "column", type: "liste", column: contacts.kind },
  conseiller: { kind: "column", type: "liste", column: contacts.ownerId },
  apporteur: { kind: "column", type: "liste", column: contacts.partnerId },
  origine: { kind: "column", type: "liste", column: contacts.originId },
  creation: { kind: "column", type: "date", column: contacts.createdAt },
  // L'étiquette vit dans une table de liaison : une sous-requête, jamais une jointure.
  etiquette: {
    kind: "custom",
    type: "liste",
    build: (condition) =>
      listOverSet(
        contacts.id,
        condition,
        (values) =>
          sql`(select ${contactTagAssignments.contactId} from ${contactTagAssignments} where ${contactTagAssignments.tagId} in ${values})`
      ),
  },
  // « Dernière activité » n'est pas une colonne : c'est le maximum du journal de la fiche.
  activite: {
    kind: "custom",
    type: "date",
    build: (condition, ctx) => {
      const bounds = dateBounds(condition, ctx);
      if (!bounds) return undefined;
      const last = sql`(select max(${activities.occurredAt}) from ${activities} where ${activities.contactId} = ${contacts.id})`;
      const parts = [bounds.from ? sql`${last} >= ${bounds.from}` : undefined, bounds.to ? sql`${last} < ${bounds.to}` : undefined].filter(
        (p): p is SQL => Boolean(p)
      );
      return parts.length === 0 ? undefined : and(...parts);
    },
  },
};

/** Les tris proposés par la liste (lot 1) — le nom reste le tri d'usine. */
export const CONTACT_SORTS = ["nom", "creation", "activite"] as const;
export type ContactSort = (typeof CONTACT_SORTS)[number];

/** Les fenêtres de « sans activité » proposées en filtre rapide. */
export const CONTACT_STALE_DAYS: Record<string, number> = { "sans-30j": 30, "sans-90j": 90, "sans-180j": 180 };

/**
 * Liste paginée + recherche. La recherche couvre nom, email, société et
 * téléphone (le téléphone est comparé espaces retirés des deux côtés :
 * « 06 12 » trouve « 0612… »). Les pierres tombales sont exclues de la
 * liste et de la recherche — elles restent accessibles par lien direct
 * depuis une affaire. Depuis le lot 1 : filtres rapides (conseiller,
 * personnes/sociétés, sans activité) et tri choisis dans l'adresse.
 */
export async function listContacts(
  user: OrgScopeUser,
  opts: {
    q?: string;
    page?: number;
    ownerId?: string;
    tagId?: string;
    /** `person` ou `company` — le filtre rapide « personnes / sociétés ». */
    kind?: "person" | "company";
    /** Une clé de `CONTACT_STALE_DAYS` : aucune activité depuis ce nombre de jours. */
    stale?: string;
    sort?: ContactSort;
    dir?: "asc" | "desc";
    /** Le jeu du constructeur de filtres (lot 3), déjà lu et « moi » résolu. */
    filters?: FilterCondition[];
    /** Le fuseau de l'organisation : les dates d'un filtre se lisent dedans. */
    timeZone?: string;
  } = {}
) {
  const page = Math.max(1, opts.page ?? 1);
  const q = opts.q?.trim();

  const conditions = [orgScope(user, contacts.organizationId), isNull(contacts.deletedAt)];
  if (q) {
    const like = `%${q}%`;
    const phoneLike = `%${q.replace(/[\s.-]/g, "")}%`;
    conditions.push(
      or(
        ilike(contacts.name, like),
        ilike(contacts.email, like),
        ilike(contacts.companyName, like),
        sql`replace(replace(replace(${contacts.phone}, ' ', ''), '.', ''), '-', '') ILIKE ${phoneLike}`
      )
    );
  }
  if (opts.ownerId) conditions.push(eq(contacts.ownerId, opts.ownerId));
  if (opts.kind) conditions.push(eq(contacts.kind, opts.kind));
  // « Sans activité » : aucune ligne de journal depuis N jours — la fiche existe, plus personne ne l'a touchée.
  const staleDays = opts.stale ? CONTACT_STALE_DAYS[opts.stale] : undefined;
  if (staleDays) {
    const since = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);
    conditions.push(
      sql`NOT EXISTS (SELECT 1 FROM ${activities} WHERE ${activities.contactId} = ${contacts.id} AND ${activities.occurredAt} >= ${since})`
    );
  }

  // Le constructeur de filtres (lot 3) : combiné en ET avec tout le reste.
  if (opts.filters?.length) {
    conditions.push(filtersToSql(opts.filters, CONTACT_FILTER_TARGETS, { timeZone: opts.timeZone ?? PRODUCT_TIMEZONE, now: new Date() }));
  }

  let idFilter;
  if (opts.tagId) {
    idFilter = db
      .select({ id: contactTagAssignments.contactId })
      .from(contactTagAssignments)
      .where(eq(contactTagAssignments.tagId, opts.tagId));
    conditions.push(sql`${contacts.id} IN ${idFilter}`);
  }

  const where = and(...conditions.filter(Boolean));

  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(contacts)
      .where(where)
      .orderBy(...contactOrder(opts.sort, opts.dir))
      .limit(CONTACTS_PAGE_SIZE)
      .offset((page - 1) * CONTACTS_PAGE_SIZE),
    db.select({ total: count() }).from(contacts).where(where),
  ]);

  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / CONTACTS_PAGE_SIZE)) };
}

/**
 * L'ordre demandé, avec l'identifiant en dernier recours : deux fiches de
 * même nom (ou créées la même seconde) gardent le MÊME ordre d'une page à
 * l'autre — sans quoi la pagination en oublie et en répète.
 */
function contactOrder(sort: ContactSort | undefined, dir: "asc" | "desc" | undefined) {
  const way = dir === "desc" ? desc : asc;
  if (sort === "creation") return [way(contacts.createdAt), asc(contacts.id)];
  if (sort === "activite") {
    const last = sql`(SELECT max(${activities.occurredAt}) FROM ${activities} WHERE ${activities.contactId} = ${contacts.id})`;
    // Une fiche sans aucune activité passe en dernier dans les deux sens : « jamais » n'est pas « le plus ancien ».
    return [sql`${last} ${dir === "asc" ? sql`ASC` : sql`DESC`} NULLS LAST`, asc(contacts.id)];
  }
  return [way(contacts.name), asc(contacts.id)];
}

/** Une fiche par id — pierre tombale comprise (une affaire peut y mener). Lève si autre organisation. */
export async function getContact(user: OrgScopeUser, id: string) {
  const contact = await db.query.contacts.findFirst({ where: eq(contacts.id, id) });
  if (!contact) throw new AppError("contact_introuvable", undefined, 404);
  assertOrgAccess(user, contact.organizationId);
  return contact;
}

/** Tout ce que la fiche affiche autour de l'identité — en parallèle, jamais en cascade. */
export async function getContactPageData(user: OrgScopeUser, contactId: string) {
  const contact = await getContact(user, contactId);

  const [tagRows, allTags, linkedDeals, openTasks, recentActivities, company, employees, owner] =
    await Promise.all([
      db
        .select({ id: contactTags.id, label: contactTags.label, color: contactTags.color })
        .from(contactTagAssignments)
        .innerJoin(contactTags, eq(contactTagAssignments.tagId, contactTags.id))
        .where(eq(contactTagAssignments.contactId, contactId))
        .orderBy(asc(contactTags.position), asc(contactTags.label)),
      db
        .select()
        .from(contactTags)
        .where(eq(contactTags.organizationId, contact.organizationId))
        .orderBy(asc(contactTags.position), asc(contactTags.label)),
      db
        .select()
        .from(deals)
        .where(and(eq(deals.contactId, contactId), eq(deals.organizationId, contact.organizationId)))
        .orderBy(desc(deals.createdAt)),
      listOpenTasksForContact(user, contactId),
      db
        .select()
        .from(activities)
        .where(eq(activities.contactId, contactId))
        .orderBy(desc(activities.occurredAt))
        .limit(50),
      contact.companyId
        ? db.query.contacts.findFirst({ where: eq(contacts.id, contact.companyId) })
        : Promise.resolve(null),
      contact.kind === "company"
        ? db
            .select()
            .from(contacts)
            .where(and(eq(contacts.companyId, contactId), isNull(contacts.deletedAt)))
            .orderBy(asc(contacts.name))
        : Promise.resolve([]),
      contact.ownerId
        ? db.query.users.findFirst({ where: eq(users.id, contact.ownerId) })
        : Promise.resolve(null),
    ]);

  return {
    contact,
    tags: tagRows,
    allTags,
    deals: linkedDeals,
    tasks: openTasks,
    activities: recentActivities,
    company: company ?? null,
    employees,
    owner: owner ?? null,
  };
}

export type CreateContactInput = {
  kind: "person" | "company";
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
  jobTitle?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
  birthDate?: string | null;
  notes?: string | null;
  ownerId?: string | null;
  source?: "manual" | "import";
  /** L'origine métier de la fiche — une ligne d'`origins` (lot 2). */
  originId?: string | null;
  /** Le confrère qui a apporté ce contact (lot 2) — l'apport ENTRANT, pas un partage PRM. */
  partnerId?: string | null;
};

/**
 * Doublons potentiels AVANT création : même email (signal fort) ou même
 * nom insensible à la casse (signal faible). Retourne les candidats — la
 * décision (créer quand même, ouvrir la fiche, fusionner) reste humaine.
 */
export async function findDuplicateCandidates(
  user: OrgScopeUser,
  input: { name: string; email?: string | null },
  excludeId?: string
) {
  if (!user.organizationId) return [];
  const signals = [sql`lower(${contacts.name}) = ${input.name.trim().toLowerCase()}`];
  if (input.email?.trim()) {
    signals.push(sql`lower(${contacts.email}) = ${input.email.trim().toLowerCase()}`);
  }
  const conditions = [
    eq(contacts.organizationId, user.organizationId),
    isNull(contacts.deletedAt),
    or(...signals),
  ];
  if (excludeId) conditions.push(ne(contacts.id, excludeId));
  return db
    .select()
    .from(contacts)
    .where(and(...conditions))
    .limit(5);
}

export async function createContact(user: OrgScopeUser, createdBy: string, input: CreateContactInput) {
  if (!user.organizationId) {
    // Seul un super admin sans organisation choisie peut arriver ici : un
    // admin/membre a TOUJOURS une organisation (contrainte en base).
    throw new AppError("aucune_organisation_selectionnee_choisis_une_organisation_dans_f1fd");
  }
  if (input.ownerId) await assertUserInOrg(input.ownerId, user.organizationId);
  // L'origine et l'apporteur appartiennent à l'organisation : la clé composite le garantit déjà en base,
  // vérifié ici pour que l'écran reçoive une phrase plutôt qu'une erreur de contrainte.
  await assertOriginInOrg(input.originId, user.organizationId);
  await assertPartnerInOrg(input.partnerId, user.organizationId);

  const now = new Date();
  const isCompany = input.kind === "company";
  const [contact] = await db
    .insert(contacts)
    .values({
      organizationId: user.organizationId,
      kind: input.kind,
      name: input.name.trim(),
      // Une personne morale ne porte aucun champ de personne physique
      // (contrainte CHECK en base — on nettoie ici pour une erreur claire).
      firstName: isCompany ? null : input.firstName?.trim() || null,
      lastName: isCompany ? null : input.lastName?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      companyName: isCompany ? null : input.companyName?.trim() || null,
      jobTitle: isCompany ? null : input.jobTitle?.trim() || null,
      city: input.city?.trim() || null,
      postalCode: input.postalCode?.trim() || null,
      country: input.country?.trim() || null,
      birthDate: isCompany ? null : input.birthDate || null,
      notes: input.notes?.trim() || null,
      ownerId: input.ownerId || null,
      // Les dates d'attribution naissent avec la fiche : « depuis quand » commence maintenant.
      ownerAssignedAt: input.ownerId ? now : null,
      originId: input.originId || null,
      partnerId: input.partnerId || null,
      partnerAttributedAt: input.partnerId ? now : null,
      source: input.source ?? "manual",
      createdBy,
    })
    .returning();
  return contact;
}

/** Une origine désignée doit être celle de l'organisation — sinon on nommerait le libellé d'un autre espace. */
async function assertOriginInOrg(originId: string | null | undefined, organizationId: string): Promise<void> {
  if (!originId) return;
  const row = await db.query.origins.findFirst({ where: eq(origins.id, originId), columns: { organizationId: true } });
  if (!row || row.organizationId !== organizationId) throw new AppError("origine_introuvable");
}

/** Un apporteur désigné doit être un confrère de l'organisation, et encore actif à l'attribution. */
async function assertPartnerInOrg(partnerId: string | null | undefined, organizationId: string): Promise<void> {
  if (!partnerId) return;
  const row = await db.query.partners.findFirst({ where: eq(partners.id, partnerId), columns: { organizationId: true } });
  if (!row || row.organizationId !== organizationId) throw new AppError("partenaire_introuvable");
}

export async function updateContact(
  user: OrgScopeUser,
  id: string,
  input: Omit<CreateContactInput, "kind" | "source">
) {
  const contact = await getContact(user, id);
  if (contact.deletedAt) throw new AppError("ce_contact_a_ete_supprime");
  if (input.ownerId) await assertUserInOrg(input.ownerId, contact.organizationId);
  await assertOriginInOrg(input.originId, contact.organizationId);
  await assertPartnerInOrg(input.partnerId, contact.organizationId);

  const now = new Date();
  const nextOwnerId = input.ownerId || null;
  const nextPartnerId = input.partnerId || null;
  // La date d'attribution ne bouge QUE quand l'attribution change : rouvrir la fiche et l'enregistrer telle
  // quelle ne doit pas rajeunir un apport — les chiffres du confrère comptent à cette date (lot 3).
  const ownerAssignedAt = nextOwnerId === contact.ownerId ? contact.ownerAssignedAt : nextOwnerId ? now : null;
  const partnerAttributedAt = nextPartnerId === contact.partnerId ? contact.partnerAttributedAt : nextPartnerId ? now : null;

  const isCompany = contact.kind === "company";
  const [updated] = await db
    .update(contacts)
    .set({
      // Le nom se recompose seulement avec prénom ET nom ; un seul des deux, ou rien, garde le nom actuel
      // (stabilisation, D3 : « Jean Dupont » importé ne devenait plus que « Jean » après une retouche).
      name: displayNameAfterUpdate(contact, input),
      firstName: isCompany ? null : input.firstName?.trim() || null,
      lastName: isCompany ? null : input.lastName?.trim() || null,
      email: input.email?.trim() || null,
      phone: input.phone?.trim() || null,
      companyName: isCompany ? null : input.companyName?.trim() || null,
      jobTitle: isCompany ? null : input.jobTitle?.trim() || null,
      city: input.city?.trim() || null,
      postalCode: input.postalCode?.trim() || null,
      country: input.country?.trim() || null,
      birthDate: isCompany ? null : input.birthDate || null,
      notes: input.notes?.trim() || null,
      ownerId: nextOwnerId,
      ownerAssignedAt,
      originId: input.originId || null,
      partnerId: nextPartnerId,
      partnerAttributedAt,
      updatedAt: now,
    })
    .where(eq(contacts.id, id))
    .returning();
  return updated;
}

// ---------------------------------------------------------------------------
// Étiquettes
// ---------------------------------------------------------------------------

/** Les étiquettes de l'organisation, pour les proposer en filtre (lot 3) — ordre d'affichage du réglage. */
export async function listContactTags(user: OrgScopeUser) {
  if (!user.organizationId) return [];
  return db
    .select({ id: contactTags.id, label: contactTags.label })
    .from(contactTags)
    .where(eq(contactTags.organizationId, user.organizationId))
    .orderBy(asc(contactTags.position), asc(contactTags.label));
}

export async function setContactTags(user: OrgScopeUser, contactId: string, tagIds: string[]) {
  const contact = await getContact(user, contactId);
  // Chaque étiquette doit appartenir à l'organisation du contact — la FK
  // composite le garantit déjà en base, vérifié ici pour l'erreur claire.
  const owned = await db
    .select({ id: contactTags.id })
    .from(contactTags)
    .where(eq(contactTags.organizationId, contact.organizationId));
  const ownedIds = new Set(owned.map((t) => t.id));
  const wanted = [...new Set(tagIds)].filter((id) => ownedIds.has(id));

  await db.delete(contactTagAssignments).where(eq(contactTagAssignments.contactId, contactId));
  if (wanted.length > 0) {
    await db.insert(contactTagAssignments).values(
      wanted.map((tagId) => ({
        organizationId: contact.organizationId,
        contactId,
        tagId,
      }))
    );
  }
}

export async function createContactTag(user: OrgScopeUser, label: string) {
  if (!user.organizationId) throw new AppError("aucune_organisation_selectionnee_choisis_une_organisation_dans_1c83");
  const trimmed = label.trim();
  if (!trimmed) throw new AppError("libelle_d_etiquette_vide");
  const [tag] = await db
    .insert(contactTags)
    .values({ organizationId: user.organizationId, label: trimmed })
    .onConflictDoNothing()
    .returning();
  if (tag) return tag;
  const existing = await db.query.contactTags.findFirst({
    where: and(eq(contactTags.organizationId, user.organizationId), eq(contactTags.label, trimmed)),
  });
  return existing!;
}

// ---------------------------------------------------------------------------
// Journal des accès (exigence données personnelles — doc §C)
// ---------------------------------------------------------------------------

/**
 * Trace un accès à la fiche. Les consultations sont dédupliquées à l'heure
 * (même lecteur, même fiche) pour que le journal reste lisible — les
 * actions (export, suppression, fusion) sont TOUJOURS écrites.
 */
export async function logContactAccess(
  contact: Pick<Contact, "id" | "organizationId">,
  userId: string | null,
  action: "view" | "export" | "delete" | "merge"
) {
  if (action === "view" && userId) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await db
      .select({ id: contactAccessLog.id })
      .from(contactAccessLog)
      .where(
        and(
          eq(contactAccessLog.contactId, contact.id),
          eq(contactAccessLog.userId, userId),
          eq(contactAccessLog.action, "view"),
          gt(contactAccessLog.createdAt, oneHourAgo)
        )
      )
      .limit(1);
    if (recent.length > 0) return;
  }
  await db.insert(contactAccessLog).values({
    organizationId: contact.organizationId,
    contactId: contact.id,
    userId,
    action,
  });
}

/** Le nombre TOTAL d'accès à une fiche — le titre du journal le dit, la liste n'en montre que les derniers (stabilisation, P7). */
export async function countContactAccessLog(user: OrgScopeUser, contactId: string): Promise<number> {
  await getContact(user, contactId); // borne l'accès à l'organisation
  const [row] = await db.select({ n: count() }).from(contactAccessLog).where(eq(contactAccessLog.contactId, contactId));
  return Number(row?.n ?? 0);
}

/** Les derniers accès à une fiche, avec le nom du lecteur — pour l'affichage sur la fiche. */
export async function listContactAccessLog(user: OrgScopeUser, contactId: string, limit = 15) {
  await getContact(user, contactId); // borne l'accès à l'organisation
  return db
    .select({
      id: contactAccessLog.id,
      action: contactAccessLog.action,
      createdAt: contactAccessLog.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(contactAccessLog)
    .leftJoin(users, eq(contactAccessLog.userId, users.id))
    .where(eq(contactAccessLog.contactId, contactId))
    .orderBy(desc(contactAccessLog.createdAt))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Export, suppression (pierre tombale), fusion — doc §C
// ---------------------------------------------------------------------------

/** Toutes les données d'un contact, en un JSON complet — l'export réglementaire. */
export async function exportContactData(user: OrgScopeUser, contactId: string, actorId: string) {
  const data = await getContactPageData(user, contactId);
  const [accessLog, allTasks, allLeads] = await Promise.all([
    db
      .select()
      .from(contactAccessLog)
      .where(eq(contactAccessLog.contactId, contactId))
      .orderBy(desc(contactAccessLog.createdAt)),
    // TOUTES les tâches de la personne, achevées comprises, en lignes
    // brutes — l'export est un inventaire complet, pas la vue de la fiche
    // (qui ne montre que l'ouvert).
    db.select().from(tasks).where(eq(tasks.contactId, contactId)).orderBy(desc(tasks.createdAt)),
    // Les leads reçus pour cette personne, réponses de simulation comprises.
    db.select().from(leads).where(eq(leads.contactId, contactId)).orderBy(desc(leads.receivedAt)),
  ]);

  // TOUT ce qui parle de la personne, sans limite (chasse aux failles du 2026-09-14 : l'export réglementaire
  // dérivait de l'écran, qui tronque les interactions à 50 et ignore rendez-vous, emails, réceptions, envois).
  const org = data.contact.organizationId;
  const [allActivities, allAppointments, sentMessages, receivedEmails, newsletterReceipts, targetMemberships, ruleActionRows] = await Promise.all([
    db.select().from(activities).where(and(eq(activities.contactId, contactId), eq(activities.organizationId, org))).orderBy(desc(activities.createdAt)),
    db.select().from(appointments).where(and(eq(appointments.contactId, contactId), eq(appointments.organizationId, org))).orderBy(desc(appointments.startsAt)),
    db.select().from(emailMessages).where(and(eq(emailMessages.contactId, contactId), eq(emailMessages.organizationId, org))).orderBy(desc(emailMessages.createdAt)),
    db.select().from(inboundEmails).where(and(eq(inboundEmails.contactId, contactId), eq(inboundEmails.organizationId, org))).orderBy(desc(inboundEmails.receivedAt)),
    db.select().from(newsletterRecipients).where(and(eq(newsletterRecipients.contactId, contactId), eq(newsletterRecipients.organizationId, org))),
    db.select().from(mailTargetMembers).where(and(eq(mailTargetMembers.contactId, contactId), eq(mailTargetMembers.organizationId, org))),
    db.select().from(ruleActions).where(and(eq(ruleActions.contactId, contactId), eq(ruleActions.organizationId, org))).orderBy(desc(ruleActions.occurredAt)),
  ]);
  const messageIds = sentMessages.map((m) => m.id);
  const messageEvents = messageIds.length > 0 ? await db.select().from(emailEvents).where(and(inArray(emailEvents.messageId, messageIds), eq(emailEvents.organizationId, org))) : [];

  await logContactAccess(data.contact, actorId, "export");

  return {
    exporteLe: new Date().toISOString(),
    fiche: data.contact,
    etiquettes: data.tags,
    affairesLiees: data.deals,
    taches: allTasks,
    interactions: allActivities,
    rendezVous: allAppointments,
    emailsEnvoyes: sentMessages,
    evenementsEmails: messageEvents,
    emailsRecus: receivedEmails,
    newslettersRecues: newsletterReceipts,
    cibles: targetMemberships,
    actionsDeRegles: ruleActionRows,
    leads: allLeads,
    journalDesAcces: accessLog,
  };
}

/**
 * Suppression réelle par pierre tombale (décision C, actée) :
 * - identité de la ligne détruite, `deleted_at` posé, name → « Contact supprimé » ;
 * - notes/activités/tâches rattachées SUPPRIMÉES physiquement (elles parlent de la personne) ;
 * - client_name des affaires liées récrit — l'affaire, ses montants et son
 *   journal PRM survivent, reliés à la tombale via contact_id.
 */
export async function deleteContact(user: OrgScopeUser, contactId: string, actorId: string, t: TranslatorOf<"contacts.queries">) {
  const contact = await getContact(user, contactId);
  if (contact.deletedAt) throw new AppError("ce_contact_est_deja_supprime");

  // L'écriture du journal AVANT la destruction : si quelque chose échoue
  // ensuite, on sait au moins qui a initié la suppression.
  await logContactAccess(contact, actorId, "delete");

  await db.batch([
    db.delete(activities).where(eq(activities.contactId, contactId)),
    db.delete(tasks).where(eq(tasks.contactId, contactId)),
    // Ce qui parle encore de la personne (chasse aux failles du 2026-09-14) : ses rendez-vous partent, ses
    // emails envoyés ou préparés perdent adresse et corps (les événements d'envoi, anonymes, restent : ce sont
    // les faits de l'organisation), les réceptions perdent leur contrepartie et leur texte, les cibles
    // manuelles l'oublient. Les suppressions (rebonds, désinscriptions) restent : elles protègent la personne.
    db.delete(appointments).where(eq(appointments.contactId, contactId)),
    db.update(emailMessages).set({ toEmail: "supprime@invalid", body: null, updatedAt: new Date() }).where(eq(emailMessages.contactId, contactId)),
    db.update(inboundEmails).set({ counterpartEmail: null, counterpartName: null, bodyText: null, proposal: null }).where(eq(inboundEmails.contactId, contactId)),
    db.delete(mailTargetMembers).where(eq(mailTargetMembers.contactId, contactId)),
    // Les leads restent (l'attribution survit à la personne, rattachée à la
    // tombale comme les affaires) ; ce qui parle d'elle part : les réponses
    // de la simulation et le lien vers sa navigation.
    db.update(leads).set({ payload: null, visitorId: null }).where(eq(leads.contactId, contactId)),
    db.delete(contactTagAssignments).where(eq(contactTagAssignments.contactId, contactId)),
    db
      .update(deals)
      .set({ clientName: t("client_supprime"), updatedAt: new Date() })
      .where(eq(deals.contactId, contactId)),
    db
      .update(contacts)
      .set({
        name: t("contact_supprime"),
        firstName: null,
        lastName: null,
        email: null,
        phone: null,
        companyName: null,
        companyId: null,
        jobTitle: null,
        city: null,
        postalCode: null,
        country: null,
        birthDate: null,
        notes: null,
        ownerId: null,
        externalSystem: null,
        externalId: null,
        lastSyncedAt: null,
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, contactId)),
    // Les salariés d'une personne morale supprimée perdent leur lien.
    db
      .update(contacts)
      .set({ companyId: null, updatedAt: new Date() })
      .where(eq(contacts.companyId, contactId)),
  ]);
}

/**
 * Fusion assistée : `absorbedId` est versé dans `survivorId`. Les enfants
 * (affaires, tâches, interactions) sont repointés, les étiquettes
 * réunies, les champs vides du survivant complétés par ceux de l'absorbé
 * (jamais d'écrasement d'une valeur existante — la fiche ouverte à
 * l'écran au moment de la fusion est celle qu'on garde). L'absorbé
 * devient une pierre tombale SANS destruction d'historique d'affaires.
 */
export async function mergeContacts(user: OrgScopeUser, survivorId: string, absorbedId: string, actorId: string, t: TranslatorOf<"contacts.queries">) {
  if (survivorId === absorbedId) throw new AppError("impossible_de_fusionner_une_fiche_avec_elle_79d9");
  const survivor = await getContact(user, survivorId);
  const absorbed = await getContact(user, absorbedId);
  if (survivor.organizationId !== absorbed.organizationId) {
    // Ne devrait jamais arriver (getContact borne déjà), ceinture et bretelles.
    throw new AppError("ces_deux_fiches_n_appartiennent_pas_a_3552");
  }
  if (survivor.deletedAt || absorbed.deletedAt) throw new AppError("impossible_de_fusionner_une_fiche_supprimee");
  if (survivor.kind !== absorbed.kind) {
    throw new AppError("impossible_de_fusionner_une_personne_physique_avec_da13");
  }

  await logContactAccess(survivor, actorId, "merge");
  await logContactAccess(absorbed, actorId, "merge");

  const fill = <K extends keyof Contact>(k: K) => survivor[k] ?? absorbed[k];

  // Étiquettes réunies : celles de l'absorbé qui manquent au survivant.
  const [survivorTags, absorbedTags] = await Promise.all([
    db.select().from(contactTagAssignments).where(eq(contactTagAssignments.contactId, survivorId)),
    db.select().from(contactTagAssignments).where(eq(contactTagAssignments.contactId, absorbedId)),
  ]);
  const have = new Set(survivorTags.map((t) => t.tagId));
  const missing = absorbedTags.filter((t) => !have.has(t.tagId));

  const notes = [survivor.notes, absorbed.notes].filter(Boolean).join("\n\n---\n\n") || null;

  await db.batch([
    db.update(deals).set({ contactId: survivorId, updatedAt: new Date() }).where(eq(deals.contactId, absorbedId)),
    db.update(tasks).set({ contactId: survivorId, updatedAt: new Date() }).where(eq(tasks.contactId, absorbedId)),
    db.update(leads).set({ contactId: survivorId }).where(eq(leads.contactId, absorbedId)),
    db
      .update(activities)
      .set({ contactId: survivorId, updatedAt: new Date() })
      .where(eq(activities.contactId, absorbedId)),
    db.update(contacts).set({ companyId: survivorId }).where(eq(contacts.companyId, absorbedId)),
    ...(missing.length > 0
      ? [
          db.insert(contactTagAssignments).values(
            missing.map((t) => ({
              organizationId: survivor.organizationId,
              contactId: survivorId,
              tagId: t.tagId,
            }))
          ),
        ]
      : []),
    db.delete(contactTagAssignments).where(eq(contactTagAssignments.contactId, absorbedId)),
    db
      .update(contacts)
      .set({
        firstName: fill("firstName"),
        lastName: fill("lastName"),
        email: fill("email"),
        phone: fill("phone"),
        companyName: fill("companyName"),
        companyId: fill("companyId"),
        jobTitle: fill("jobTitle"),
        city: fill("city"),
        postalCode: fill("postalCode"),
        country: fill("country"),
        birthDate: fill("birthDate"),
        ownerId: fill("ownerId"),
        notes,
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, survivorId)),
    // L'absorbé devient une tombale qui pointe la fusion — pas une
    // suppression réglementaire : ses données vivent dans le survivant.
    db
      .update(contacts)
      .set({
        name: t("fiche_fusionnee"),
        firstName: null,
        lastName: null,
        email: null,
        phone: null,
        companyName: null,
        companyId: null,
        jobTitle: null,
        city: null,
        postalCode: null,
        country: null,
        birthDate: null,
        notes: null,
        ownerId: null,
        externalSystem: null,
        externalId: null,
        lastSyncedAt: null,
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, absorbedId)),
  ]);
}

// ---------------------------------------------------------------------------
// Import CSV
// ---------------------------------------------------------------------------

export type ImportField =
  | "name"
  | "firstName"
  | "lastName"
  | "email"
  | "phone"
  | "companyName"
  | "jobTitle"
  | "city"
  | "postalCode"
  | "country"
  | "notes"
  /** Le conseiller, par son ADRESSE : c'est la seule identité stable d'un compte dans un fichier (lot 2). */
  | "owner"
  /** Le confrère apporteur, par son NOM exact tel qu'il est au répertoire (lot 2). */
  | "partner"
  /** L'origine métier, par son LIBELLÉ exact — la même liste que pilote l'analytique (lot 2). */
  | "origin";

/** Les trois colonnes du lot 2 : elles désignent une ligne existante, elles n'en créent aucune. */
export const IMPORT_REFERENCE_FIELDS = ["owner", "partner", "origin"] as const;

export type ImportRowInput = {
  /** Numéro de ligne DANS LE FICHIER (en-tête = 1), pour un rapport lisible. */
  line: number;
  values: Partial<Record<ImportField, string>>;
};

/**
 * skip     : une fiche déjà connue (même email) est écartée, listée au rapport.
 * complete : elle est COMPLÉTÉE — seuls ses champs vides reçoivent les
 *            valeurs du fichier, jamais d'écrasement d'une valeur existante.
 *            C'est le cas d'usage principal : réimporter l'export de son CRM
 *            pour rattraper des téléphones ou des sociétés manquants.
 */
export type ImportMode = "skip" | "complete";

/** Sur quoi une ligne a été reconnue comme une fiche existante : l'email, sinon le téléphone, sinon le nom et la ville (stabilisation, D7). */
export type ImportMatchedBy = "email" | "phone" | "name_city";

export type ImportReport = {
  inserted: number;
  /** Lignes qui ont complété une fiche existante, avec les champs remplis et ce qui a servi à la reconnaître. */
  completed: { line: number; contactId: string; name: string; fields: string[]; matchedBy: ImportMatchedBy }[];
  skipped: { line: number; reason: string }[];
  error: string | null;
};

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_IMPORT_ROWS = 5000;

/**
 * Champs qu'une ligne d'import peut remplir sur une fiche existante — jamais le nom ; l'email seulement quand la fiche
 * a été reconnue autrement (par téléphone, par nom et ville) et n'en a pas encore : l'identité qui a servi à apparier ne se réécrit pas.
 */
const COMPLETABLE: { field: Exclude<ImportField, "name" | (typeof IMPORT_REFERENCE_FIELDS)[number]> }[] = [
  { field: "email" },
  { field: "firstName" },
  { field: "lastName" },
  { field: "phone" },
  { field: "companyName" },
  { field: "jobTitle" },
  { field: "city" },
  { field: "postalCode" },
  { field: "country" },
  { field: "notes" },
];

/**
 * Import partiel assumé : chaque ligne est validée indépendamment, les
 * valides entrent, les autres sortent dans le rapport ligne par ligne avec
 * leur numéro réel dans le fichier. Une fiche déjà connue est reconnue par
 * l'email, sinon par le téléphone normalisé, sinon par le nom exact et la
 * ville (stabilisation, D7 : avant, une ligne sans email créait toujours une
 * fiche — réimporter un fichier sans emails doublait la base) ; le rapport
 * dit sur quoi chaque ligne a été reconnue.
 */
export async function importContacts(
  user: OrgScopeUser,
  actorId: string,
  rows: ImportRowInput[],
  mode: ImportMode,
  /** Les raisons du rapport d'import, dans la langue de la personne. */
  t: TranslatorOf<"contacts.queries">
): Promise<ImportReport> {
  if (!user.organizationId) {
    return { inserted: 0, completed: [], skipped: [], error: t("aucune_organisation_selectionnee_choisis_une_organisation_5b59") };
  }
  if (rows.length === 0) return { inserted: 0, completed: [], skipped: [], error: t("aucune_ligne_a_importer") };
  if (rows.length > MAX_IMPORT_ROWS) {
    return {
      inserted: 0,
      completed: [],
      skipped: [],
      error: t("trop_de_lignes_l_import_est_f3ad", { count: rows.length, maxImportRows: MAX_IMPORT_ROWS }),
    };
  }

  // Toutes les fiches vivantes, indexées par chacune de leurs identités — plusieurs
  // fiches peuvent partager un email ou un téléphone (rien ne l'interdit en base).
  const existing = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.organizationId, user.organizationId), isNull(contacts.deletedAt)));
  const indexes: Record<ImportMatchedBy, Map<string, Contact[]>> = { email: new Map(), phone: new Map(), name_city: new Map() };
  const index = (by: ImportMatchedBy, key: string | null, c: Contact) => {
    if (!key) return;
    indexes[by].set(key, [...(indexes[by].get(key) ?? []), c]);
  };
  for (const c of existing) {
    index("email", c.email?.toLowerCase() || null, c);
    index("phone", phoneKey(c.phone), c);
    index("name_city", nameCityKey(c.name, c.city), c);
  }

  // Les trois colonnes du lot 2 DÉSIGNENT des lignes existantes : un conseiller par son adresse, un confrère
  // par son nom, une origine par son libellé. Rien n'est créé au passage — un import qui invente des comptes,
  // des partenaires et des libellés produit un répertoire que personne n'a voulu. Une valeur inconnue rejette
  // la ligne avec son motif, et le fichier se corrige.
  const [importUsers, importPartners, importOrigins] = await Promise.all([
    db.select({ id: users.id, email: users.email }).from(users).where(eq(users.organizationId, user.organizationId)),
    db.select({ id: partners.id, name: partners.name, active: partners.active }).from(partners).where(eq(partners.organizationId, user.organizationId)),
    db.select({ id: origins.id, label: origins.label }).from(origins).where(eq(origins.organizationId, user.organizationId)),
  ]);
  const key = (value: string) => value.trim().toLowerCase();
  const usersByEmail = new Map(importUsers.map((u) => [key(u.email), u.id]));
  const partnersByName = new Map(importPartners.filter((p) => p.active).map((p) => [key(p.name), p.id]));
  const originsByLabel = new Map(importOrigins.map((o) => [key(o.label), o.id]));
  const importedAt = new Date();

  const report: ImportReport = { inserted: 0, completed: [], skipped: [], error: null };
  const toInsert: (typeof contacts.$inferInsert)[] = [];
  // Les valeurs à poser : du texte pour les champs de la fiche, un identifiant et une date pour les
  // références du lot 2 (conseiller, apporteur, origine).
  const toComplete: { line: number; contact: Contact; updates: Record<string, string | Date>; fields: string[]; matchedBy: ImportMatchedBy }[] = [];
  const seenInFile = new Set<string>();

  for (const row of rows) {
    const v = row.values;
    const name = v.name?.trim();
    const email = v.email?.trim() || null;

    if (!name) {
      report.skipped.push({ line: row.line, reason: t("nom_manquant") });
      continue;
    }
    if (email && !EMAIL_SHAPE.test(email)) {
      report.skipped.push({ line: row.line, reason: t("email_invalide", { email }) });
      continue;
    }
    // Les identités de la ligne, dans l'ordre où elles reconnaissent une fiche ; chacune dite en clair pour le rapport.
    const identities: { by: ImportMatchedBy; key: string; label: string }[] = [];
    const emailKey = email?.toLowerCase();
    if (emailKey) identities.push({ by: "email", key: emailKey, label: t("identite_email", { value: email ?? "" }) });
    const phone = phoneKey(v.phone);
    if (phone) identities.push({ by: "phone", key: phone, label: t("identite_telephone", { value: v.phone?.trim() ?? "" }) });
    const nameCity = nameCityKey(name, v.city);
    if (nameCity) identities.push({ by: "name_city", key: nameCity, label: t("identite_nom_ville", { name, city: v.city?.trim() ?? "" }) });

    // Les trois références, résolues avant tout le reste : une ligne qui en porte une inconnue ne s'écrit pas
    // à moitié.
    const resolve = (raw: string | undefined, table: Map<string, string>, reason: (value: string) => string) => {
      const value = raw?.trim();
      if (!value) return { id: null as string | null, error: null as string | null };
      const id = table.get(key(value));
      return id ? { id, error: null } : { id: null, error: reason(value) };
    };
    const owner = resolve(v.owner, usersByEmail, (value) => t("conseiller_inconnu", { value }));
    const partner = resolve(v.partner, partnersByName, (value) => t("partenaire_inconnu", { value }));
    const origin = resolve(v.origin, originsByLabel, (value) => t("origine_inconnue", { value }));
    const referenceError = owner.error ?? partner.error ?? origin.error;
    if (referenceError) {
      report.skipped.push({ line: row.line, reason: referenceError });
      continue;
    }
    const references = { ownerId: owner.id, partnerId: partner.id, originId: origin.id };

    const seen = identities.find((identity) => seenInFile.has(`${identity.by}:${identity.key}`));
    if (seen) {
      report.skipped.push({ line: row.line, reason: t("ignoree_apparait_plus_haut_reconnue_par", { identity: seen.label }) });
      continue;
    }
    for (const identity of identities) seenInFile.add(`${identity.by}:${identity.key}`);

    const recognized = identities.map((identity) => ({ ...identity, matches: indexes[identity.by].get(identity.key) ?? [] })).find((identity) => identity.matches.length > 0);
    if (recognized) {
      const { matches, label, by } = recognized;
      if (mode === "skip") {
        report.skipped.push({ line: row.line, reason: t("ignoree_existe_deja_reconnue_par", { identity: label }) });
        continue;
      }
      if (matches.length > 1) {
        report.skipped.push({ line: row.line, reason: t("plusieurs_fiches_reconnues_par", { identity: label }) });
        continue;
      }
      const target = matches[0];
      const updates: Record<string, string | Date> = {};
      const fields: string[] = [];
      for (const { field } of COMPLETABLE) {
        // L'email ne se pose que sur une fiche reconnue autrement : une ligne reconnue par son email n'a rien à lui apprendre.
        if (field === "email" && by === "email") continue;
        const incoming = v[field]?.trim();
        if (incoming && !target[field]) {
          updates[field] = incoming;
          fields.push(t(`fields.${field}`));
        }
      }
      // Les références du lot 2 complètent aussi, et seulement quand la fiche n'a rien : un import ne
      // réattribue pas une fiche déjà suivie par quelqu'un.
      if (references.ownerId && !target.ownerId) {
        updates.ownerId = references.ownerId;
        updates.ownerAssignedAt = importedAt;
        fields.push(t("fields.owner"));
      }
      if (references.partnerId && !target.partnerId) {
        updates.partnerId = references.partnerId;
        updates.partnerAttributedAt = importedAt;
        fields.push(t("fields.partner"));
      }
      if (references.originId && !target.originId) {
        updates.originId = references.originId;
        fields.push(t("fields.origin"));
      }
      if (fields.length === 0) {
        report.skipped.push({ line: row.line, reason: t("deja_a_jour_reconnue_par", { identity: label }) });
        continue;
      }
      toComplete.push({ line: row.line, contact: target, updates, fields, matchedBy: by });
      continue;
    }

    toInsert.push({
      organizationId: user.organizationId,
      kind: "person",
      name,
      firstName: v.firstName?.trim() || null,
      lastName: v.lastName?.trim() || null,
      email,
      phone: v.phone?.trim() || null,
      companyName: v.companyName?.trim() || null,
      jobTitle: v.jobTitle?.trim() || null,
      city: v.city?.trim() || null,
      postalCode: v.postalCode?.trim() || null,
      country: v.country?.trim() || null,
      notes: v.notes?.trim() || null,
      ownerId: references.ownerId,
      ownerAssignedAt: references.ownerId ? importedAt : null,
      partnerId: references.partnerId,
      // La date de l'apport est celle de l'IMPORT : le fichier ne la porte pas, et inventer une date
      // antérieure fausserait les chiffres du confrère (lot 3).
      partnerAttributedAt: references.partnerId ? importedAt : null,
      originId: references.originId,
      source: "import",
      createdBy: actorId,
    });
  }

  // Écritures par paquets — jamais tout le fichier dans une seule requête.
  const CHUNK = 500;
  try {
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK);
      await db.insert(contacts).values(chunk);
      report.inserted += chunk.length;
    }
    const UPDATE_CHUNK = 100;
    for (let i = 0; i < toComplete.length; i += UPDATE_CHUNK) {
      const chunk = toComplete.slice(i, i + UPDATE_CHUNK);
      await db.batch(
        chunk.map((c) =>
          db
            .update(contacts)
            .set({ ...c.updates, updatedAt: new Date() })
            .where(eq(contacts.id, c.contact.id))
        ) as unknown as Parameters<typeof db.batch>[0]
      );
      for (const c of chunk) {
        report.completed.push({ line: c.line, contactId: c.contact.id, name: c.contact.name, fields: c.fields, matchedBy: c.matchedBy });
      }
    }
  } catch (error) {
    // La cause dans le journal (audit, constat Q4), la phrase à l'écran dans la langue de la personne.
    log.error("contacts_import_interrupted", { organizationId: user.organizationId, inserted: report.inserted, completed: report.completed.length, error });
    report.error =
      report.inserted > 0 || report.completed.length > 0
        ? t("import_interrompu_apres", { inserted: report.inserted, completed: report.completed.length })
        : t("import_echoue_avant_la_premiere_fiche");
  }
  return report;
}

/** Le nombre de fiches vivantes — la tuile du tableau de bord. */
export async function countContacts(user: OrgScopeUser): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(contacts)
    .where(and(orgScope(user, contacts.organizationId), isNull(contacts.deletedAt)));
  return row?.n ?? 0;
}

/**
 * Le brief d'une newsletter écrite POUR ce contact : ce que la fiche sait
 * d'utile pour personnaliser — identité professionnelle, étiquettes,
 * affaires en cours avec leur étape. Jamais les notes privées du
 * conseiller ni la date de naissance : le brief part au modèle d'IA, on n'y
 * met que ce qu'un email pourrait légitimement refléter. Le composer de
 * newsletters n'est pas modifié : il reçoit un brouillon comme un autre.
 */
export async function buildContactNewsletterBrief(user: OrgScopeUser, contactId: string, t: TranslatorOf<"contacts.queries">) {
  const contact = await getContact(user, contactId);
  if (contact.deletedAt) throw new AppError("cette_fiche_a_ete_supprimee_on_n_b6bc");

  const [tagRows, openDeals] = await Promise.all([
    db
      .select({ label: contactTags.label })
      .from(contactTagAssignments)
      .innerJoin(contactTags, eq(contactTagAssignments.tagId, contactTags.id))
      .where(eq(contactTagAssignments.contactId, contactId))
      .orderBy(asc(contactTags.position), asc(contactTags.label)),
    db
      .select({ title: deals.title, stageLabel: dealStatuses.label })
      .from(deals)
      .innerJoin(dealStatuses, eq(deals.statusId, dealStatuses.id))
      .where(
        and(
          eq(deals.organizationId, contact.organizationId),
          eq(deals.contactId, contactId),
          isNull(dealStatuses.outcome)
        )
      )
      .orderBy(desc(deals.updatedAt))
      .limit(5),
  ]);

  const isPerson = contact.kind === "person";
  // « Directrice financière chez Cap Test » forme un seul groupe — la
  // virgule sépare les groupes, pas la fonction de la société.
  const role = isPerson
    ? [contact.jobTitle, contact.companyName ? t("chez_societe", { company: contact.companyName }) : null].filter(Boolean).join(" ")
    : "";
  const who = [contact.name, role || null, contact.city].filter(Boolean).join(", ");

  const lines = [t("destinataire", { who })];
  if (tagRows.length > 0) lines.push(t("etiquettes", { join: tagRows.map((t) => t.label).join(", ") }));
  if (openDeals.length > 0) {
    lines.push(
      t("affaires_en_cours", { join: openDeals.map((d) => t("affaire_a_l_etape", { title: d.title, stage: d.stageLabel })).join(" ; ") })
    );
  }
  lines.push(t("objectif_de_l_email_a_preciser_2f4d"));

  return { title: t("newsletter_pour", { name: contact.name }), brief: lines.join("\n") };
}

/** Les conseillers de l'organisation (pour l'attribution). */
export async function listOrgUsers(user: OrgScopeUser) {
  if (!user.organizationId) return [];
  return listOrgUsersOf(user.organizationId);
}

/** Les conseillers d'UNE organisation donnée — pour une fiche dont l'organisation est déjà vérifiée (stabilisation, S4). */
export async function listOrgUsersOf(organizationId: string) {
  return db
    // Rôle et date de création : ce qu'il faut pour désigner un responsable par défaut (src/lib/default-owner.ts).
    .select({ id: users.id, name: users.name, email: users.email, role: users.role, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.organizationId, organizationId))
    .orderBy(asc(users.name));
}
