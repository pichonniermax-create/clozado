import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { partners } from "@/db/schema";
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
