import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { assertOrgAccess, orgScope } from "@/db/scope";
import { parseBusinessPack, type BusinessPackKey } from "@/lib/metrics/packs";
import type { OrgScopeUser } from "@/lib/session";
import { AppError } from "@/lib/errors";
import type { AppLocale } from "@/i18n/locales";
import type { Currency } from "@/lib/currencies";

/**
 * Première utilisation du garde-fou générique orgScope (src/db/scope.ts) :
 * un super_admin voit tout, tout autre utilisateur ne voit jamais que sa
 * propre organisation. C'est ce même helper que les futurs outils métier
 * réutiliseront sur leurs propres tables.
 */
export async function getVisibleOrganizations(user: OrgScopeUser) {
  const scope = orgScope(user, organizations.id);
  return scope
    ? db.select().from(organizations).where(scope)
    : db.select().from(organizations);
}

/** L'organisation de l'utilisateur connecté (null pour un super_admin). */
export async function getOwnOrganization(user: OrgScopeUser) {
  if (!user.organizationId) return null;
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, user.organizationId),
  });
  return org ?? null;
}

/**
 * L'organisation propriétaire d'une donnée déjà chargée et déjà autorisée
 * (typiquement une affaire passée par `getDeal`, qui a fait son
 * `assertOrgAccess`). À utiliser partout où l'on a besoin de la marque de
 * l'organisation d'UN OBJET plutôt que de celle de l'utilisateur connecté.
 *
 * `assertOrgAccess` est refait ici et non supposé : c'est une lecture par
 * id, elle ne doit jamais servir à récupérer une organisation arbitraire.
 * Un super_admin passe (il n'a pas d'organisation propre mais voit tout),
 * ce qui est exactement le cas que `getOwnOrganizationOrThrow` ne pouvait
 * pas traiter.
 */
export async function getOrganizationOfRecord(user: OrgScopeUser, organizationId: string) {
  assertOrgAccess(user, organizationId);
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, organizationId),
  });
  if (!org) throw new AppError("organisation_introuvable", undefined, 404);
  return org;
}

export type BrandingInput = {
  name: string;
  /** Hexadécimal normalisé (« #2563eb ») ou null — validé par l'écran, jamais une chaîne libre. */
  primaryColor: string | null;
  fontFamily: string | null;
  /** Le nom d'expéditeur des emails ; null = le nom de l'organisation (`emailSender`, src/lib/email/sender.ts). */
  senderName: string | null;
  /** L'adresse de réponse — validée par l'écran (`isPlausibleEmail`), en minuscules, jamais une chaîne libre. */
  senderEmail: string | null;
};

/**
 * Modifie la marque blanche d'une organisation. Garde-fou d'écriture :
 * seul un admin peut écrire, et uniquement sur SA propre organisation
 * (le WHERE porte sur user.organizationId, jamais sur un id fourni par
 * l'appelant) — même si cette fonction est appelée directement, une
 * autre organisation ne peut jamais être modifiée.
 */
export async function updateOrganizationBranding(
  user: OrgScopeUser,
  data: BrandingInput
) {
  if (user.role !== "admin" || !user.organizationId) {
    throw new AppError("acces_refuse_seul_l_admin_de_l_7ac9", undefined, 403);
  }

  await db
    .update(organizations)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(organizations.id, user.organizationId));
}

export type RegionalSettingsInput = { defaultLocale: AppLocale; currency: Currency; timezone: string };

/**
 * La langue par défaut, la devise et le fuseau de l'organisation — le même
 * garde-fou que la marque : un admin, sur SA propre organisation. Les
 * valeurs sont validées par l'appelant contre les listes du code
 * (`LOCALES`, `CURRENCIES`, `Intl`) : rien d'autre n'entre en base.
 */
export async function updateOrganizationSettings(user: OrgScopeUser, data: RegionalSettingsInput): Promise<void> {
  if (user.role !== "admin" || !user.organizationId) {
    throw new AppError("acces_refuse_seul_l_admin_de_l_7ac9", undefined, 403);
  }
  await db.update(organizations).set({ ...data, updatedAt: new Date() }).where(eq(organizations.id, user.organizationId));
}

/**
 * Choisit le pack métier de l'organisation — le même garde-fou que la
 * marque : un admin, sur SA propre organisation. La clé est validée contre
 * le registre des packs : rien d'autre n'entre en base.
 */
export async function updateOrganizationPack(user: OrgScopeUser, pack: string): Promise<BusinessPackKey> {
  if (user.role !== "admin" || !user.organizationId) {
    throw new AppError("acces_refuse_seul_l_admin_de_l_54d2", undefined, 403);
  }
  const key = parseBusinessPack(pack);
  if (!key) throw new AppError("pack_metier_inconnu");
  await db.update(organizations).set({ businessPack: key, updatedAt: new Date() }).where(eq(organizations.id, user.organizationId));
  return key;
}

/** Ce que la vérification du domaine d'expédition écrit — toujours l'ensemble, tel que le fournisseur l'a dit. */
export type EmailDomainState = {
  emailDomain: string | null;
  emailDomainProviderId: string | null;
  emailDomainStatus: string | null;
  emailDomainRecords: unknown;
  emailDomainCheckedAt: Date | null;
  emailDomainCheckError: string | null;
  emailDomainVerifiedAt: Date | null;
};

/** Écrit l'état du domaine d'expédition — un admin, sur SA propre organisation (chantier engagement, §3.2). */
export async function saveEmailDomainState(user: OrgScopeUser, state: EmailDomainState): Promise<void> {
  if (user.role !== "admin" || !user.organizationId) {
    throw new AppError("acces_refuse_seul_l_admin_de_l_7ac9", undefined, 403);
  }
  await db.update(organizations).set({ ...state, updatedAt: new Date() }).where(eq(organizations.id, user.organizationId));
}

/**
 * L'ADRESSE D'INGESTION (chantier engagement, §4.1) — le jeton s'écrit une
 * fois, et se régénère à la demande : l'ancienne adresse cesse aussitôt
 * d'être acceptée (aucun email en vol n'est « rattrapé »). Même garde-fou
 * que le reste des réglages : un admin, sur SA propre organisation.
 */
export async function saveIngestToken(user: OrgScopeUser, token: string): Promise<void> {
  if (user.role !== "admin" || !user.organizationId) {
    throw new AppError("acces_refuse_seul_l_admin_de_l_7ac9", undefined, 403);
  }
  await db.update(organizations).set({ ingestToken: token, updatedAt: new Date() }).where(eq(organizations.id, user.organizationId));
}

/** « Conserver le corps des emails reçus » — décoché, le corps est NULL dès la réception, pas seulement caché. */
export async function setStoreInboundBodies(user: OrgScopeUser, store: boolean): Promise<void> {
  if (user.role !== "admin" || !user.organizationId) {
    throw new AppError("acces_refuse_seul_l_admin_de_l_7ac9", undefined, 403);
  }
  await db.update(organizations).set({ storeInboundBodies: store, updatedAt: new Date() }).where(eq(organizations.id, user.organizationId));
}

export type LegalFootprintInput = { country: string | null; postalAddress: string | null; legalMention: string | null; privacyPolicyUrl: string | null };

/** Les faits du pied de page conforme (pays, adresse postale, mentions, politique de confidentialité) — validés par l'écran. */
export async function updateOrganizationLegal(user: OrgScopeUser, data: LegalFootprintInput): Promise<void> {
  if (user.role !== "admin" || !user.organizationId) {
    throw new AppError("acces_refuse_seul_l_admin_de_l_7ac9", undefined, 403);
  }
  await db.update(organizations).set({ ...data, updatedAt: new Date() }).where(eq(organizations.id, user.organizationId));
}
