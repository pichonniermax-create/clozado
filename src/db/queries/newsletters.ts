import { asc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  contacts,
  mailTargets,
  newsletterRecipients,
  newsletters,
  organizations,
  signatories,
  verifiedFigures,
} from "@/db/schema";
import { assertOrgAccess } from "@/db/scope";
import { parseCriteria, type SegmentCriteria } from "@/lib/targets/criteria";
import { describeTarget, loadCriteriaOptions, memberCondition } from "./mail-targets";
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

// ---------------------------------------------------------------------------
// « Marquer comme envoyée » — le moment où l'audience est figée
// ---------------------------------------------------------------------------

/**
 * La photographie de l'audience au marquage : la cible telle qu'elle était
 * (libellé, nature, critères ET leur description en phrases — les
 * étiquettes ou étapes peuvent être renommées plus tard, la phrase reste
 * juste) et le nombre. Lue par la liste, la fiche contact et
 * l'anti-répétition ; jamais recalculée depuis des critères vivants.
 */
export type AudienceSnapshot = {
  targetId: string;
  label: string;
  kind: "segment" | "static";
  criteria: SegmentCriteria;
  summary: string[];
  count: number;
};

export function parseAudienceSnapshot(value: unknown): AudienceSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Partial<AudienceSnapshot>;
  if (typeof v.label !== "string" || typeof v.count !== "number") return null;
  return {
    targetId: typeof v.targetId === "string" ? v.targetId : "",
    label: v.label,
    kind: v.kind === "static" ? "static" : "segment",
    criteria: parseCriteria(v.criteria),
    summary: Array.isArray(v.summary) ? v.summary.filter((s): s is string => typeof s === "string") : [],
    count: v.count,
  };
}

/** Les sujets traités, tels que saisis (« taux, assurance emprunteur ») : nettoyés, dédoublonnés, bornés. */
export function normalizeTopics(raw: string | string[]): string[] {
  const parts = (Array.isArray(raw) ? raw : raw.split(/[,;\n]/)).map((t) => t.trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of parts) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t.slice(0, 80));
    if (out.length >= 20) break;
  }
  return out;
}

function textArray(values: string[]): SQL {
  if (values.length === 0) return sql`ARRAY[]::text[]`;
  return sql`ARRAY[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `
  )}]::text[]`;
}

export async function getNewsletterOrThrow(user: OrgScopeUser, id: string) {
  const newsletter = await db.query.newsletters.findFirst({ where: eq(newsletters.id, id) });
  if (!newsletter) throw new Error("Newsletter introuvable.");
  assertOrgAccess(user, newsletter.organizationId);
  return newsletter;
}

/**
 * Marque la newsletter envoyée à une date déclarée (modifiable : on peut le
 * dire après coup) et FIGE son audience : les membres de la cible à cet
 * instant vont dans `newsletter_recipients`, la cible telle qu'elle est
 * dans `audience_snapshot`. UN seul ordre SQL (CTE modifiante + UPDATE) :
 * atomique par construction, sans transaction — le driver HTTP n'en a pas.
 * Ensuite, modifier, dupliquer ou désactiver la cible ne change rien au
 * passé.
 */
export async function markNewsletterSent(
  user: OrgScopeUser,
  id: string,
  input: { sentAt: Date; topics: string[]; markedBy: string }
) {
  const newsletter = await getNewsletterOrThrow(user, id);
  if (newsletter.sentAt) throw new Error("Cette newsletter est déjà marquée envoyée.");
  const target = await db.query.mailTargets.findFirst({ where: eq(mailTargets.id, newsletter.targetId) });
  if (!target || target.organizationId !== newsletter.organizationId) {
    throw new Error("La cible de cette newsletter est introuvable.");
  }
  const options = await loadCriteriaOptions(newsletter.organizationId);
  const snapshot: Omit<AudienceSnapshot, "count"> = {
    targetId: target.id,
    label: target.label,
    kind: target.kind === "static" ? "static" : "segment",
    criteria: parseCriteria(target.criteria),
    summary: describeTarget(target, options),
  };
  const topics = normalizeTopics(input.topics);
  await db.execute(sql`
    WITH ins AS (
      INSERT INTO ${newsletterRecipients} (organization_id, newsletter_id, contact_id)
      SELECT ${newsletter.organizationId}::uuid, ${id}::uuid, ${contacts.id}
      FROM ${contacts}
      WHERE ${memberCondition(target)}
      ON CONFLICT DO NOTHING
      RETURNING contact_id
    )
    UPDATE ${newsletters}
    SET sent_at = ${input.sentAt}, sent_marked_by = ${input.markedBy}::uuid, topics = ${textArray(topics)},
        audience_snapshot = (${JSON.stringify(snapshot)}::jsonb || jsonb_build_object('count', (SELECT count(*) FROM ins))),
        updated_at = now()
    WHERE id = ${id}::uuid`);
}

/** Annule un marquage (mauvais clic, mauvaise date) : la photographie est effacée avec lui. Les sujets restent ceux de la newsletter. */
export async function unmarkNewsletterSent(user: OrgScopeUser, id: string) {
  const newsletter = await getNewsletterOrThrow(user, id);
  if (!newsletter.sentAt) throw new Error("Cette newsletter n'est pas marquée envoyée.");
  await db.batch([
    db.delete(newsletterRecipients).where(eq(newsletterRecipients.newsletterId, id)),
    db
      .update(newsletters)
      .set({ sentAt: null, sentMarkedBy: null, audienceSnapshot: null, updatedAt: new Date() })
      .where(eq(newsletters.id, id)),
  ]);
}

export async function updateNewsletterTopics(user: OrgScopeUser, id: string, topics: string[]) {
  await getNewsletterOrThrow(user, id);
  await db
    .update(newsletters)
    .set({ topics: normalizeTopics(topics), updatedAt: new Date() })
    .where(eq(newsletters.id, id));
}
