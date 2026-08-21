import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { mailTargets, organizations, signatories, verifiedFigures } from "@/db/schema";
import { assertOrgAccess } from "@/db/scope";
import type { RenderBrand, RenderSignatory } from "@/lib/newsletter/render-email";
import type {
  OrganizationProfile,
  SignatoryProfile,
  TargetProfile,
  VerifiedFigureProfile,
} from "@/lib/ai/types";
import type { OrgScopeUser } from "@/lib/session";

/**
 * Charge une cible par id, vérifie qu'elle appartient bien à l'organisation
 * de l'appelant (`assertOrgAccess` — jamais un `organizationId` fourni par
 * le client), puis résout son organisation et son signataire par défaut.
 * Base commune à `getDesignContext` (profil pour l'IA) et `getRenderContext`
 * (marque + signataire pour le rendu HTML) — jamais deux lectures séparées
 * qui pourraient diverger.
 */
async function resolveTargetContext(user: OrgScopeUser, targetId: string) {
  const target = await db.query.mailTargets.findFirst({
    where: eq(mailTargets.id, targetId),
  });
  if (!target) {
    throw new Error("Cible introuvable.");
  }
  assertOrgAccess(user, target.organizationId);

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, target.organizationId),
  });
  if (!org) {
    throw new Error("Organisation introuvable.");
  }

  const signatory = target.defaultSignatoryId
    ? await db.query.signatories.findFirst({
        where: eq(signatories.id, target.defaultSignatoryId),
      })
    : undefined;

  return { target, org, signatory };
}

/**
 * Tout ce dont `AnthropicProvider.designNewsletter` a besoin, résolu depuis
 * la base pour UNE cible précise — jamais une valeur de marque en dur
 * (§7.2 du dossier de reconstruction).
 */
export type DesignContext = {
  organization: OrganizationProfile;
  target: TargetProfile;
  signatory: SignatoryProfile;
  verifiedFigures: VerifiedFigureProfile[];
};

export async function getDesignContext(
  user: OrgScopeUser,
  targetId: string
): Promise<DesignContext> {
  const { target, org, signatory } = await resolveTargetContext(user, targetId);

  const figures = await db.query.verifiedFigures.findMany({
    where: eq(verifiedFigures.organizationId, org.id),
    orderBy: asc(verifiedFigures.position),
  });

  return {
    organization: {
      name: org.name,
      tagline: org.tagline,
      toneOfVoice: org.toneOfVoice,
      editorialGuidelines: org.editorialGuidelines,
    },
    target: {
      label: target.label,
      persona: target.persona,
      audienceLabel: target.audienceLabel,
      editorialVoice: target.editorialVoice,
    },
    signatory: signatory ? { name: signatory.name, jobTitle: signatory.jobTitle } : null,
    verifiedFigures: figures.map((f) => ({ label: f.label, value: f.value })),
  };
}

/** Marque + signataire nécessaires à `renderNewsletterHtml` pour une cible donnée. */
export type RenderContext = {
  brand: RenderBrand;
  signatory: RenderSignatory;
};

export async function getRenderContext(
  user: OrgScopeUser,
  targetId: string
): Promise<RenderContext> {
  const { org, signatory } = await resolveTargetContext(user, targetId);
  return {
    brand: toRenderBrand(org),
    signatory: signatory ? { name: signatory.name, jobTitle: signatory.jobTitle } : null,
  };
}

/** `organizations` -> `RenderBrand` (§ `render-email.ts`) : même mapping partout où une newsletter est rendue. */
export function toRenderBrand(org: typeof organizations.$inferSelect): RenderBrand {
  return {
    name: org.name,
    logoUrl: org.logoUrl,
    logoLockupText: org.logoLockupText,
    primaryColor: org.primaryColor,
    secondaryColor: org.secondaryColor,
    inkColor: org.inkColor,
    backgroundColor: org.backgroundColor,
    headingFontFamily: org.headingFontFamily,
    headingFontFallback: org.headingFontFallback,
    fontFamily: org.fontFamily,
    bodyFontFallback: org.bodyFontFallback,
    borderRadius: org.borderRadius,
  };
}

/** L'organisation de l'utilisateur connecté, garde-fou d'isolation inclus (jamais un id fourni par l'appelant). */
export async function getOwnOrganizationOrThrow(user: OrgScopeUser) {
  if (!user.organizationId) {
    throw new Error("Aucune organisation sélectionnée. Choisis une organisation dans le bandeau super admin en haut de l'écran : ce geste s'applique à une organisation précise.");
  }
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, user.organizationId),
  });
  if (!org) {
    throw new Error("Organisation introuvable.");
  }
  return org;
}
