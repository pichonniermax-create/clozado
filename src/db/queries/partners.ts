import { and, asc, desc, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contacts, dealEvents, deals, dealShares, dealStatuses, partners } from "@/db/schema";
import { assertOrgAccess, orgScope } from "@/db/scope";
import type { OrgScopeUser } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { MIN_OBSERVATIONS } from "@/lib/metrics/definitions";
import { readInput } from "@/lib/validation";

/** Partenaires de l'organisation de l'appelant. */
export async function listPartners(user: OrgScopeUser) {
  const scope = orgScope(user, partners.organizationId);
  const query = db.select().from(partners).orderBy(asc(partners.name));
  return scope ? query.where(scope) : query;
}

export async function getPartner(user: OrgScopeUser, id: string) {
  const partner = await db.query.partners.findFirst({ where: eq(partners.id, id) });
  if (!partner) return null;
  assertOrgAccess(user, partner.organizationId);
  return partner;
}

export type CreatePartnerInput = {
  name: string;
  company?: string | null;
  profession?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
};

export type UpdatePartnerInput = Partial<CreatePartnerInput> & { active?: boolean };

/**
 * LA FORME STRICTE de ce qu'un client peut écrire sur un partenaire
 * (constat S1 de l'audit) : `createPartnerAction(input)` est appelable par
 * n'importe quel navigateur avec n'importe quel JSON — une clé
 * `organizationId` ou `id` glissée dans l'entrée entrait autrefois telle
 * quelle dans l'INSERT (le spread venait APRÈS l'organisation, donc
 * l'écrasait : un partenaire créé chez une autre organisation). Ici, une
 * clé inconnue est un refus, et l'objet écrit est construit champ par
 * champ — jamais un spread de l'entrée.
 */
const optionalText = (max: number) => z.string().max(max).nullable().optional();

const PARTNER_FIELDS = {
  name: z.string().trim().min(1).max(200),
  company: optionalText(200),
  profession: optionalText(120),
  email: optionalText(254),
  phone: optionalText(40),
  notes: optionalText(5000),
};

export const CREATE_PARTNER_SCHEMA = z.strictObject(PARTNER_FIELDS);
export const UPDATE_PARTNER_SCHEMA = CREATE_PARTNER_SCHEMA.partial().extend({ active: z.boolean().optional() });

export async function createPartner(user: OrgScopeUser, input: CreatePartnerInput) {
  if (!user.organizationId) {
    throw new AppError("aucune_organisation_selectionnee_choisis_une_organisation_dans_ed3b");
  }
  const data = readInput(CREATE_PARTNER_SCHEMA, input);
  const [partner] = await db
    .insert(partners)
    .values({
      organizationId: user.organizationId,
      name: data.name,
      company: data.company ?? null,
      profession: data.profession ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      notes: data.notes ?? null,
    })
    .returning();
  return partner;
}

export async function updatePartner(user: OrgScopeUser, id: string, input: UpdatePartnerInput) {
  const data = readInput(UPDATE_PARTNER_SCHEMA, input);
  const existing = await db.query.partners.findFirst({ where: eq(partners.id, id) });
  if (!existing) throw new AppError("partenaire_introuvable", undefined, 404);
  assertOrgAccess(user, existing.organizationId);

  // Seuls les champs PRÉSENTS changent : `undefined` = « ne touche pas », null = « efface ».
  const [updated] = await db
    .update(partners)
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.company !== undefined ? { company: data.company } : {}),
      ...(data.profession !== undefined ? { profession: data.profession } : {}),
      ...(data.email !== undefined ? { email: data.email } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
      updatedAt: new Date(),
    })
    .where(eq(partners.id, id))
    .returning();
  return updated;
}

// ---------------------------------------------------------------------------
// Les chiffres d'un partenaire (lot 3) — l'APPORT, pas le partage
// ---------------------------------------------------------------------------

/**
 * CE QUE CHAQUE CONFRÈRE A APPORTÉ, sur une période (lot 3). Les
 * définitions sont celles du plan, et il n'y en a qu'une par indicateur :
 *
 * - **Contacts apportés** : les fiches vivantes dont `partner_id` est ce
 *   confrère, comptées à la date de l'ATTRIBUTION (`partner_attributed_at`),
 *   jamais à la création de la fiche. Corriger le passé ne réécrit donc pas
 *   une période déjà publiée — même règle que les leads.
 * - **Affaires en cours / gagnées** : les affaires de ces contacts-là, par
 *   l'issue de leur étape COURANTE (sans issue = en cours).
 * - **Montant gagné** : la somme des montants estimés des affaires gagnées
 *   de ces contacts.
 * - **Taux de transformation** : affaires gagnées ÷ contacts apportés sur
 *   la période, masqué sous cinq contacts (le même seuil que partout
 *   ailleurs : en dessous, un pourcentage ment).
 * - **Dernier apport** et **dernier échange** ne sont PAS bornés par la
 *   période : ce sont des faits sur le confrère, pas des mesures. Le
 *   dernier échange est, pour l'instant, le plus récent d'un partage envoyé
 *   ou d'un événement de partage où il a agi — les échanges saisis à la
 *   main viendront quand `activities` portera un partenaire (migration
 *   0023, pas encore faite).
 */
export type PartnerFigures = {
  partnerId: string;
  /** Contacts apportés DANS la période. */
  broughtInPeriod: number;
  dealsOpen: number;
  dealsWon: number;
  /** Somme des montants estimés des affaires gagnées, en unités de la devise. */
  wonAmount: number;
  /** Gagnées ÷ apportés sur la période ; `null` sous le seuil (le dire, plutôt qu'un chiffre faux). */
  transformationRate: number | null;
  /** Le nombre qui manque pour atteindre le seuil, quand le taux est masqué. */
  missingForRate: number;
  /** Toute période confondue. */
  lastBroughtAt: Date | null;
  lastExchangeAt: Date | null;
};

/**
 * Sous ce nombre d'apports, un taux de transformation ne veut rien dire : il
 * est masqué. LE MÊME seuil que tous les indicateurs du produit
 * (`MIN_OBSERVATIONS`) — un seul nombre, pas un cinq recopié ici.
 */
export const PARTNER_RATE_MIN = MIN_OBSERVATIONS;

export async function listPartnerFigures(
  user: OrgScopeUser,
  range: { from?: Date; to?: Date } = {}
): Promise<Map<string, PartnerFigures>> {
  const organizationId = user.organizationId;
  if (!organizationId) return new Map();
  const inPeriod = and(
    range.from ? gte(contacts.partnerAttributedAt, range.from) : undefined,
    range.to ? lt(contacts.partnerAttributedAt, range.to) : undefined
  );

  const [brought, last, exchanges] = await Promise.all([
    // Une affaire n'a qu'un contact : compter les affaires distinctes et sommer leurs montants
    // dans la même requête ne double personne.
    db
      .select({
        partnerId: contacts.partnerId,
        brought: sql<number>`count(distinct ${contacts.id})::int`,
        open: sql<number>`count(distinct ${deals.id}) filter (where ${dealStatuses.outcome} is null)::int`,
        won: sql<number>`count(distinct ${deals.id}) filter (where ${dealStatuses.outcome} = 'won')::int`,
        wonAmount: sql<string>`coalesce(sum(${deals.estimatedAmount}) filter (where ${dealStatuses.outcome} = 'won'), 0)`,
      })
      .from(contacts)
      .leftJoin(deals, and(eq(deals.contactId, contacts.id), eq(deals.organizationId, contacts.organizationId)))
      .leftJoin(dealStatuses, eq(dealStatuses.id, deals.statusId))
      .where(
        and(
          eq(contacts.organizationId, organizationId),
          isNull(contacts.deletedAt),
          isNotNull(contacts.partnerId),
          inPeriod
        )
      )
      .groupBy(contacts.partnerId),
    db
      .select({ partnerId: contacts.partnerId, at: sql<Date | null>`max(${contacts.partnerAttributedAt})` })
      .from(contacts)
      .where(and(eq(contacts.organizationId, organizationId), isNull(contacts.deletedAt), isNotNull(contacts.partnerId)))
      .groupBy(contacts.partnerId),
    // Le dernier échange : un partage envoyé, ou un geste du confrère sur un partage.
    db
      .select({
        partnerId: sql<string>`p`,
        at: sql<Date | null>`max(at)`,
      })
      .from(
        sql`(
          select ${dealShares.partnerId} as p, ${dealShares.sentAt} as at
          from ${dealShares} where ${dealShares.organizationId} = ${organizationId}
          union all
          select ${dealEvents.actorPartnerId} as p, ${dealEvents.createdAt} as at
          from ${dealEvents} where ${dealEvents.organizationId} = ${organizationId} and ${dealEvents.actorPartnerId} is not null
        ) as echanges`
      )
      .groupBy(sql`p`),
  ]);

  const figures = new Map<string, PartnerFigures>();
  const ensure = (id: string): PartnerFigures => {
    const existing = figures.get(id);
    if (existing) return existing;
    const fresh: PartnerFigures = {
      partnerId: id,
      broughtInPeriod: 0,
      dealsOpen: 0,
      dealsWon: 0,
      wonAmount: 0,
      transformationRate: null,
      missingForRate: PARTNER_RATE_MIN,
      lastBroughtAt: null,
      lastExchangeAt: null,
    };
    figures.set(id, fresh);
    return fresh;
  };

  for (const row of brought) {
    if (!row.partnerId) continue;
    const f = ensure(row.partnerId);
    f.broughtInPeriod = row.brought;
    f.dealsOpen = row.open;
    f.dealsWon = row.won;
    f.wonAmount = Number(row.wonAmount) || 0;
    f.transformationRate = row.brought >= PARTNER_RATE_MIN ? row.won / row.brought : null;
    f.missingForRate = Math.max(0, PARTNER_RATE_MIN - row.brought);
  }
  for (const row of last) if (row.partnerId) ensure(row.partnerId).lastBroughtAt = row.at ? new Date(row.at) : null;
  for (const row of exchanges) if (row.partnerId) ensure(row.partnerId).lastExchangeAt = row.at ? new Date(row.at) : null;
  return figures;
}

// ---------------------------------------------------------------------------
// Ce qu'un confrère a amené, pour SA fiche (lot 3)
// ---------------------------------------------------------------------------

/** Ce qu'une fiche montre d'une liste : les derniers, jamais tout. Le reste se déroule sur l'écran de la liste. */
export const PARTNER_PREVIEW = 8;

export type BroughtContact = {
  id: string;
  name: string;
  kind: string;
  city: string | null;
  attributedAt: Date | null;
};

export type BroughtDeal = {
  id: string;
  title: string;
  contactId: string | null;
  contactName: string;
  amount: number | null;
  statusLabel: string;
  statusColor: string | null;
  outcome: "won" | "lost" | null;
  createdAt: Date;
};

/**
 * LES APPORTS D'UN CONFRÈRE, en clair : les dernières fiches qu'il a
 * amenées et les dernières affaires qui en sont nées, avec leur TOTAL. La
 * fiche montre les huit dernières et dit combien il y en a ; la liste
 * filtrée (`/contacts?f=apporteur:eq:<id>`) déroule le reste — une fiche
 * n'est pas une liste.
 *
 * Hors période, volontairement : ce sont des FAITS (qui, et quand), pas des
 * mesures. Les quatre chiffres du haut, eux, suivent la période partagée et
 * viennent de `listPartnerFigures` — la fiche et le tableau comptent avec
 * la même requête, jamais deux calculs voisins qui divergeraient.
 *
 * Le périmètre est celui du CONFRÈRE (son organisation), pas celui de
 * l'appelant : un super admin lit la fiche qu'il a ouverte, et personne
 * d'autre ne franchit `assertOrgAccess`.
 */
export async function listPartnerBrought(user: OrgScopeUser, partnerId: string, limit = PARTNER_PREVIEW) {
  const partner = await db.query.partners.findFirst({ where: eq(partners.id, partnerId), columns: { organizationId: true } });
  if (!partner) throw new AppError("partenaire_introuvable", undefined, 404);
  assertOrgAccess(user, partner.organizationId);
  const org = partner.organizationId;

  // Les fiches vivantes qu'il a apportées ; les affaires sont celles de ces fiches-là.
  const broughtContacts = and(eq(contacts.organizationId, org), eq(contacts.partnerId, partnerId), isNull(contacts.deletedAt));

  const [contactRows, contactCount, dealRows, dealCount] = await Promise.all([
    db
      .select({
        id: contacts.id,
        name: contacts.name,
        kind: contacts.kind,
        city: contacts.city,
        attributedAt: contacts.partnerAttributedAt,
      })
      .from(contacts)
      .where(broughtContacts)
      // « Sans date d'attribution » (une fiche d'avant le lot 2) passe en DERNIER, jamais en tête :
      // en SQL, `desc` met les NULL devant — ici ce serait l'inverse de ce qu'on lit.
      .orderBy(sql`${contacts.partnerAttributedAt} desc nulls last`, asc(contacts.name))
      .limit(limit),
    db.select({ n: sql<number>`count(*)::int` }).from(contacts).where(broughtContacts),
    db
      .select({
        id: deals.id,
        title: deals.title,
        contactId: deals.contactId,
        contactName: contacts.name,
        amount: deals.estimatedAmount,
        statusLabel: dealStatuses.label,
        statusColor: dealStatuses.color,
        outcome: dealStatuses.outcome,
        createdAt: deals.createdAt,
      })
      .from(deals)
      .innerJoin(contacts, and(eq(deals.contactId, contacts.id), eq(deals.organizationId, contacts.organizationId)))
      .innerJoin(dealStatuses, eq(dealStatuses.id, deals.statusId))
      .where(and(eq(deals.organizationId, org), broughtContacts))
      .orderBy(desc(deals.createdAt))
      .limit(limit),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(deals)
      .innerJoin(contacts, and(eq(deals.contactId, contacts.id), eq(deals.organizationId, contacts.organizationId)))
      .where(and(eq(deals.organizationId, org), broughtContacts)),
  ]);

  return {
    contacts: contactRows.map((row): BroughtContact => ({ ...row, attributedAt: row.attributedAt ?? null })),
    contactsTotal: contactCount[0]?.n ?? 0,
    deals: dealRows.map(
      (row): BroughtDeal => ({ ...row, amount: row.amount === null ? null : Number(row.amount) })
    ),
    dealsTotal: dealCount[0]?.n ?? 0,
  };
}
