import { and, asc, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contacts, dealEvents, deals, dealShares, dealStatuses, partners } from "@/db/schema";
import { assertOrgAccess, orgScope } from "@/db/scope";
import type { OrgScopeUser } from "@/lib/session";
import { AppError } from "@/lib/errors";
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

/** Sous ce nombre d'apports, un taux de transformation ne veut rien dire : il est masqué. */
export const PARTNER_RATE_MIN = 5;

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
