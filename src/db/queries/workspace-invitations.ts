import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { isUndefinedTable } from "@/db/errors";
import { organizations, workspaceInvitations, type WorkspaceInvitation } from "@/db/schema";
import { isAppLocale, type AppLocale } from "@/i18n/locales";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { isReservedExampleAddress } from "@/lib/demo/constants";
import { isPlausibleEmail } from "@/lib/email/address";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";
import { invitationStatus, type InvitationStatus } from "@/lib/invitations/status";
import { generateInvitationToken, hashInvitationToken, INVITATION_SECRET_USAGE } from "@/lib/invitations/token";
import type { SessionUser } from "@/lib/session";
import { readInput } from "@/lib/validation";

/**
 * LES INVITATIONS À CRÉER UN ESPACE (docs/module-invitations.md §1) —
 * côté base. Deux côtés, deux disciplines :
 * - le côté GESTIONNAIRE (créer, lister, révoquer, marquer envoyée) n'est
 *   ouvert qu'au super admin RÉEL — vérifié ici, pas seulement dans
 *   l'action : une invitation n'appartient à aucune organisation, aucun
 *   `orgScope` ne la couvre ;
 * - le côté PUBLIC (résoudre un jeton, le consommer) ne reçoit qu'un jeton
 *   et ne rend que ce que l'inscription doit afficher — jamais la note
 *   interne, jamais l'auteur.
 *
 * L'usage unique est une écriture ATOMIQUE (`claimInvitation`) : `used_at`
 * est posé par un UPDATE conditionnel AVANT la création de l'espace ; deux
 * soumissions simultanées du même lien ne créent jamais deux espaces.
 */

/** Les durées de validité proposées à la création, en jours. */
export const INVITATION_VALIDITY_DAYS = [7, 14, 30] as const;
export const DEFAULT_INVITATION_VALIDITY_DAYS = 14;

export { invitationStatus, type InvitationStatus } from "@/lib/invitations/status";

function requireSuperAdmin(user: SessionUser): SessionUser {
  if (user.role !== "super_admin") throw new AppError("reserve_au_super_admin_un_utilisateur_n_8405", undefined, 403);
  return user;
}

// ---------------------------------------------------------------------------
// Côté gestionnaire
// ---------------------------------------------------------------------------

export const CREATE_INVITATION_SCHEMA = z.strictObject({
  organizationName: z.string().trim().min(2).max(120),
  /** Vide = lien ouvert, sans adresse réservée. */
  email: z.string().trim().max(254).optional().default(""),
  locale: z.string().refine(isAppLocale),
  validityDays: z.coerce.number().int().refine((d): d is (typeof INVITATION_VALIDITY_DAYS)[number] => (INVITATION_VALIDITY_DAYS as readonly number[]).includes(d)),
  note: z.string().trim().max(2000).optional().default(""),
});

export type CreateInvitationInput = z.input<typeof CREATE_INVITATION_SCHEMA>;

/**
 * Crée une invitation et rend le jeton EN CLAIR — la seule fois où il
 * existe en dehors de sa forme chiffrée. L'adresse réservée, si elle est
 * donnée, est normalisée en minuscules : c'est ainsi qu'elle sera comparée
 * à l'inscription.
 */
export async function createWorkspaceInvitation(user: SessionUser, rawInput: CreateInvitationInput): Promise<{ invitation: WorkspaceInvitation; token: string }> {
  requireSuperAdmin(user);
  const input = readInput(CREATE_INVITATION_SCHEMA, rawInput);
  const email = input.email ? input.email.toLowerCase() : null;
  // La même règle qu'à l'inscription : une adresse sur un domaine réservé aux exemples ne recevra jamais rien — réserver un lien pour elle n'aurait pas de sens.
  if (email && (!isPlausibleEmail(email) || isReservedExampleAddress(email))) throw new AppError("cette_adresse_email_ne_semble_pas_valide");
  const { token, tokenHash } = generateInvitationToken();
  const expiresAt = new Date(Date.now() + input.validityDays * 86_400_000);
  const [invitation] = await db
    .insert(workspaceInvitations)
    .values({
      tokenHash,
      tokenEncrypted: encryptSecret(token, INVITATION_SECRET_USAGE),
      organizationName: input.organizationName,
      email,
      locale: input.locale,
      note: input.note || null,
      createdBy: user.id,
      createdByEmail: user.email ?? null,
      expiresAt,
    })
    .returning();
  return { invitation, token };
}

export type InvitationListItem = WorkspaceInvitation & {
  status: InvitationStatus;
  /** Le jeton en clair — seulement pour une invitation EN ATTENTE, pour recopier le lien ; null sinon. */
  token: string | null;
  organization: { id: string; name: string; slug: string } | null;
};

/** Toutes les invitations, les plus récentes d'abord, avec leur état calculé et l'espace créé le cas échéant. */
export async function listWorkspaceInvitations(user: SessionUser, limit = 200): Promise<InvitationListItem[]> {
  requireSuperAdmin(user);
  const rows = await db
    .select({ invitation: workspaceInvitations, organization: { id: organizations.id, name: organizations.name, slug: organizations.slug } })
    .from(workspaceInvitations)
    .leftJoin(organizations, eq(organizations.id, workspaceInvitations.organizationId))
    .orderBy(desc(workspaceInvitations.createdAt))
    .limit(limit);
  const now = new Date();
  return rows.map(({ invitation, organization }) => {
    const status = invitationStatus(invitation, now);
    return {
      ...invitation,
      status,
      token: status === "en_attente" ? decryptSecret(invitation.tokenEncrypted, INVITATION_SECRET_USAGE) : null,
      organization: organization?.id ? organization : null,
    };
  });
}

/** Une invitation par identifiant, pour l'afficher juste après sa création (le lien à copier) ; null si elle n'existe pas. */
export async function getWorkspaceInvitation(user: SessionUser, id: string): Promise<InvitationListItem | null> {
  requireSuperAdmin(user);
  const all = await listWorkspaceInvitations(user);
  return all.find((row) => row.id === id) ?? null;
}

export async function countPendingInvitations(user: SessionUser): Promise<number> {
  requireSuperAdmin(user);
  try {
    const [row] = await db
      .select({ n: sql<number>`count(*)` })
      .from(workspaceInvitations)
      .where(and(isNull(workspaceInvitations.usedAt), isNull(workspaceInvitations.revokedAt), gt(workspaceInvitations.expiresAt, new Date())));
    return Number(row?.n ?? 0);
  } catch (error) {
    // La migration 0018 pas encore appliquée sur cette base : la carte compte zéro, le tableau de bord vit.
    if (isUndefinedTable(error)) {
      log.warn("workspace_invitations_table_missing", { where: "countPendingInvitations" });
      return 0;
    }
    throw error;
  }
}

/** La table existe-t-elle sur cette base ? (Migration 0018 appliquée.) Pour que l'écran le dise plutôt que de tomber. */
export async function invitationsAvailable(): Promise<boolean> {
  try {
    await db.select({ id: workspaceInvitations.id }).from(workspaceInvitations).limit(1);
    return true;
  } catch (error) {
    if (isUndefinedTable(error)) return false;
    throw error;
  }
}

/** Révoque une invitation EN ATTENTE : le lien ne sert plus. Une invitation déjà utilisée ou close ne se révoque pas (rien à révoquer). */
export async function revokeWorkspaceInvitation(user: SessionUser, id: string): Promise<void> {
  requireSuperAdmin(user);
  const [updated] = await db
    .update(workspaceInvitations)
    .set({ revokedAt: new Date() })
    .where(and(eq(workspaceInvitations.id, id), isNull(workspaceInvitations.usedAt), isNull(workspaceInvitations.revokedAt)))
    .returning({ id: workspaceInvitations.id });
  if (!updated) throw new AppError("invitation_deja_utilisee_ou_close", undefined, 404);
}

/** Ce qu'un envoi d'email a besoin de savoir : l'invitation EN ATTENTE, avec son adresse réservée et son jeton en clair. */
export async function getInvitationForSending(user: SessionUser, id: string): Promise<{ invitation: WorkspaceInvitation; email: string; token: string; locale: AppLocale }> {
  requireSuperAdmin(user);
  const invitation = await db.query.workspaceInvitations.findFirst({ where: eq(workspaceInvitations.id, id) });
  if (!invitation) throw new AppError("invitation_introuvable", undefined, 404);
  if (invitationStatus(invitation) !== "en_attente") throw new AppError("invitation_deja_utilisee_ou_close");
  if (!invitation.email) throw new AppError("invitation_sans_adresse");
  const token = decryptSecret(invitation.tokenEncrypted, INVITATION_SECRET_USAGE);
  if (!token) throw new AppError("invitation_introuvable", undefined, 404);
  return { invitation, email: invitation.email, token, locale: isAppLocale(invitation.locale) ? invitation.locale : "fr" };
}

export async function markInvitationSent(user: SessionUser, id: string): Promise<void> {
  requireSuperAdmin(user);
  await db.update(workspaceInvitations).set({ sentAt: new Date() }).where(eq(workspaceInvitations.id, id));
}

// ---------------------------------------------------------------------------
// Côté public — l'inscription
// ---------------------------------------------------------------------------

/** Ce que l'écran d'inscription montre d'une invitation : rien de plus. */
export type PublicInvitation = {
  id: string;
  organizationName: string;
  /** L'adresse réservée, en minuscules ; null pour un lien ouvert. */
  email: string | null;
  locale: AppLocale;
  expiresAt: Date;
};

export type ResolvedInvitation = { ok: true; invitation: PublicInvitation } | { ok: false; reason: "not_found" | "used" | "expired" | "revoked" };

function toPublic(row: WorkspaceInvitation): PublicInvitation {
  return {
    id: row.id,
    organizationName: row.organizationName,
    email: row.email,
    locale: isAppLocale(row.locale) ? row.locale : "fr",
    expiresAt: row.expiresAt,
  };
}

/** Résout un jeton présenté par un inconnu : l'invitation si elle est en attente, sinon le motif — sans jamais dire qui l'a créée. */
export async function resolveInvitation(token: string): Promise<ResolvedInvitation> {
  let row: WorkspaceInvitation | undefined;
  try {
    row = await db.query.workspaceInvitations.findFirst({ where: eq(workspaceInvitations.tokenHash, hashInvitationToken(token)) });
  } catch (error) {
    // Sans la table (migration 0018 non appliquée), aucun lien n'est valable — l'inscription libre reste là.
    if (!isUndefinedTable(error)) throw error;
    log.warn("workspace_invitations_table_missing", { where: "resolveInvitation" });
    return { ok: false, reason: "not_found" };
  }
  if (!row) return { ok: false, reason: "not_found" };
  const status = invitationStatus(row);
  if (status === "utilisee") return { ok: false, reason: "used" };
  if (status === "revoquee") return { ok: false, reason: "revoked" };
  if (status === "expiree") return { ok: false, reason: "expired" };
  return { ok: true, invitation: toPublic(row) };
}

export type ClaimedInvitation = { ok: true; invitation: PublicInvitation } | { ok: false; reason: "not_found" | "used" | "expired" | "revoked" | "email_mismatch" };

/**
 * CONSOMME une invitation, atomiquement : `used_at` et `used_by_email` sont
 * posés par un seul UPDATE conditionnel (en attente, non révoquée, non
 * expirée, et l'adresse réservée respectée s'il y en a une). Aucune ligne
 * touchée = la résolution dit pourquoi. L'appelant crée ENSUITE l'espace,
 * puis le rattache (`attachInvitationOrganization`) — ou rend l'invitation
 * (`releaseInvitation`) si la création n'a pas eu lieu.
 */
export async function claimInvitation(token: string, email: string): Promise<ClaimedInvitation> {
  const normalized = email.trim().toLowerCase();
  const now = new Date();
  let row: WorkspaceInvitation | undefined;
  try {
    [row] = await db
    .update(workspaceInvitations)
    .set({ usedAt: now, usedByEmail: normalized })
    .where(
      and(
        eq(workspaceInvitations.tokenHash, hashInvitationToken(token)),
        isNull(workspaceInvitations.usedAt),
        isNull(workspaceInvitations.revokedAt),
        gt(workspaceInvitations.expiresAt, now),
        sql`(${workspaceInvitations.email} IS NULL OR ${workspaceInvitations.email} = ${normalized})`
      )
    )
    .returning();
  } catch (error) {
    if (!isUndefinedTable(error)) throw error;
    return { ok: false, reason: "not_found" };
  }
  if (row) return { ok: true, invitation: toPublic(row) };
  const resolved = await resolveInvitation(token);
  if (!resolved.ok) return resolved;
  // En attente mais non consommée : l'adresse réservée ne correspond pas.
  return { ok: false, reason: "email_mismatch" };
}

/** L'espace créé par une invitation consommée. */
export async function attachInvitationOrganization(id: string, organizationId: string): Promise<void> {
  await db.update(workspaceInvitations).set({ organizationId }).where(eq(workspaceInvitations.id, id));
}

/** Rend une invitation consommée dont la création d'espace n'a pas abouti : elle redevient en attente. */
export async function releaseInvitation(id: string): Promise<void> {
  await db.update(workspaceInvitations).set({ usedAt: null, usedByEmail: null, organizationId: null }).where(and(eq(workspaceInvitations.id, id), isNull(workspaceInvitations.organizationId)));
}
