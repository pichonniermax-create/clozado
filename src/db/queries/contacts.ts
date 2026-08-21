import { and, asc, count, desc, eq, gt, ilike, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  contactAccessLog,
  contacts,
  contactTagAssignments,
  contactTags,
  deals,
  tasks,
  users,
  type Contact,
} from "@/db/schema";
import { assertOrgAccess, orgScope } from "@/db/scope";
import type { OrgScopeUser } from "@/lib/session";

/** Taille de page de la liste — côté serveur, jamais la table entière en mémoire. */
export const CONTACTS_PAGE_SIZE = 50;

/**
 * Liste paginée + recherche. La recherche couvre nom, email, société et
 * téléphone (le téléphone est comparé espaces retirés des deux côtés :
 * « 06 12 » trouve « 0612… »). Les pierres tombales sont exclues de la
 * liste et de la recherche — elles restent accessibles par lien direct
 * depuis une affaire.
 */
export async function listContacts(
  user: OrgScopeUser,
  opts: { q?: string; page?: number; ownerId?: string; tagId?: string } = {}
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
      .orderBy(asc(contacts.name), asc(contacts.id))
      .limit(CONTACTS_PAGE_SIZE)
      .offset((page - 1) * CONTACTS_PAGE_SIZE),
    db.select({ total: count() }).from(contacts).where(where),
  ]);

  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / CONTACTS_PAGE_SIZE)) };
}

/** Une fiche par id — pierre tombale comprise (une affaire peut y mener). Lève si autre organisation. */
export async function getContact(user: OrgScopeUser, id: string) {
  const contact = await db.query.contacts.findFirst({ where: eq(contacts.id, id) });
  if (!contact) throw new Error("Contact introuvable.");
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
      db
        .select()
        .from(tasks)
        .where(and(eq(tasks.contactId, contactId), eq(tasks.status, "open")))
        .orderBy(asc(tasks.dueAt)),
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
    throw new Error("Aucune organisation associée à cet utilisateur.");
  }
  if (input.ownerId) await assertUserInOrg(input.ownerId, user.organizationId);

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
      source: input.source ?? "manual",
      createdBy,
    })
    .returning();
  return contact;
}

export async function updateContact(
  user: OrgScopeUser,
  id: string,
  input: Omit<CreateContactInput, "kind" | "source">
) {
  const contact = await getContact(user, id);
  if (contact.deletedAt) throw new Error("Ce contact a été supprimé.");
  if (input.ownerId) await assertUserInOrg(input.ownerId, contact.organizationId);

  const isCompany = contact.kind === "company";
  const [updated] = await db
    .update(contacts)
    .set({
      // Vide (ex: fiche importée sans prénom/nom séparés, champs laissés
      // tels quels) = on garde le nom actuel, jamais un nom effacé.
      name: input.name.trim() || contact.name,
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
      updatedAt: new Date(),
    })
    .where(eq(contacts.id, id))
    .returning();
  return updated;
}

async function assertUserInOrg(userId: string, organizationId: string) {
  const u = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!u || u.organizationId !== organizationId) {
    throw new Error("Ce conseiller n'appartient pas à l'organisation du contact.");
  }
}

// ---------------------------------------------------------------------------
// Étiquettes
// ---------------------------------------------------------------------------

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
  if (!user.organizationId) throw new Error("Aucune organisation associée à cet utilisateur.");
  const trimmed = label.trim();
  if (!trimmed) throw new Error("Libellé d'étiquette vide.");
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
  const accessLog = await db
    .select()
    .from(contactAccessLog)
    .where(eq(contactAccessLog.contactId, contactId))
    .orderBy(desc(contactAccessLog.createdAt));

  await logContactAccess(data.contact, actorId, "export");

  return {
    exporteLe: new Date().toISOString(),
    fiche: data.contact,
    etiquettes: data.tags,
    affairesLiees: data.deals,
    taches: data.tasks,
    interactions: data.activities,
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
export async function deleteContact(user: OrgScopeUser, contactId: string, actorId: string) {
  const contact = await getContact(user, contactId);
  if (contact.deletedAt) throw new Error("Ce contact est déjà supprimé.");

  // L'écriture du journal AVANT la destruction : si quelque chose échoue
  // ensuite, on sait au moins qui a initié la suppression.
  await logContactAccess(contact, actorId, "delete");

  await db.batch([
    db.delete(activities).where(eq(activities.contactId, contactId)),
    db.delete(tasks).where(eq(tasks.contactId, contactId)),
    db.delete(contactTagAssignments).where(eq(contactTagAssignments.contactId, contactId)),
    db
      .update(deals)
      .set({ clientName: "Client supprimé", updatedAt: new Date() })
      .where(eq(deals.contactId, contactId)),
    db
      .update(contacts)
      .set({
        name: "Contact supprimé",
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
export async function mergeContacts(user: OrgScopeUser, survivorId: string, absorbedId: string, actorId: string) {
  if (survivorId === absorbedId) throw new Error("Impossible de fusionner une fiche avec elle-même.");
  const survivor = await getContact(user, survivorId);
  const absorbed = await getContact(user, absorbedId);
  if (survivor.organizationId !== absorbed.organizationId) {
    // Ne devrait jamais arriver (getContact borne déjà), ceinture et bretelles.
    throw new Error("Ces deux fiches n'appartiennent pas à la même organisation.");
  }
  if (survivor.deletedAt || absorbed.deletedAt) throw new Error("Impossible de fusionner une fiche supprimée.");
  if (survivor.kind !== absorbed.kind) {
    throw new Error("Impossible de fusionner une personne physique avec une personne morale.");
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
        name: "Fiche fusionnée",
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

/** Les conseillers de l'organisation (pour l'attribution). */
export async function listOrgUsers(user: OrgScopeUser) {
  if (!user.organizationId) return [];
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.organizationId, user.organizationId))
    .orderBy(asc(users.name));
}
