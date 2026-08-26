import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  contacts,
  mailTargets,
  newsletterRecipients,
  newsletters,
  newsletterSources,
  organizations,
  signatories,
  watchItems,
} from "@/db/schema";
import { assertOrgAccess } from "@/db/scope";
import { assetUrlsFromMeta } from "@/lib/brand/assets";
import { parseCriteria, type SegmentCriteria } from "@/lib/targets/criteria";
import { listOrganizationAssetMeta, type AssetMeta } from "./organization-assets";
import { describeTarget, loadCriteriaOptions, memberCondition } from "./mail-targets";
import { listCitableFigures } from "./market";
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

  // Seuls les chiffres COMPLETS (source ET date) partent au modèle : la
  // règle « aucun chiffre sans sa date et sa source » s'applique aussi aux
  // chiffres internes ; l'écran des chiffres montre ceux qui manquent.
  const figures = await listCitableFigures(org.id);

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
    verifiedFigures: figures.map((f) => ({ label: f.label, value: f.value, sourceName: f.sourceName ?? "", asOf: f.asOf ?? "" })),
  };
}

/** Marque + signataire nécessaires à `renderNewsletterHtml` pour une cible donnée. */
export type RenderContext = {
  brand: RenderBrand;
  signatory: RenderSignatory;
};

export async function getRenderContext(
  user: OrgScopeUser,
  targetId: string,
  /** L'origine publique de la requête : un email est lu hors du produit, son logo doit être une adresse absolue. */
  origin?: string
): Promise<RenderContext> {
  const { org, signatory } = await resolveTargetContext(user, targetId);
  return {
    brand: await resolveRenderBrand(org, origin),
    signatory: signatory ? { name: signatory.name, jobTitle: signatory.jobTitle } : null,
  };
}

/**
 * `organizations` (+ ses images téléversées) -> `RenderBrand` (§
 * `render-email.ts`) : même mapping partout où une newsletter ou une
 * vitrine est rendue. Le logo téléversé (chantier marque blanche) prime
 * sur `logo_url`, qui reste le repli des organisations qui l'utilisaient ;
 * absolu quand une origine est donnée — un email est lu hors du produit —,
 * relatif sinon (les écrans).
 */
export function toRenderBrand(org: typeof organizations.$inferSelect, assets: AssetMeta[] = [], origin = ""): RenderBrand {
  const uploaded = assetUrlsFromMeta(org.id, assets).logo_light;
  return {
    name: org.name,
    logoUrl: uploaded ? `${origin}${uploaded}` : org.logoUrl,
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

/** `toRenderBrand` avec les images lues en base — pour les appelants qui ne les ont pas déjà sous la main. */
export async function resolveRenderBrand(org: typeof organizations.$inferSelect, origin?: string): Promise<RenderBrand> {
  return toRenderBrand(org, await listOrganizationAssetMeta(org.id), origin);
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

// ---------------------------------------------------------------------------
// La matière d'une newsletter (chantier ciblage et contenu, étape 4)
// ---------------------------------------------------------------------------

/**
 * Rattache des articles du panier à une newsletter (`newsletter_sources`) —
 * idempotent. C'est ce lien qui signale « déjà utilisé » dans la veille et
 * qui permettra (étape 6) de citer chaque source avec son lien. Les FK
 * composites refusent un article d'une autre organisation ; le code le
 * vérifie avant, pour un message lisible.
 */
export async function attachNewsletterSources(user: OrgScopeUser, newsletterId: string, itemIds: string[]): Promise<number> {
  const unique = Array.from(new Set(itemIds));
  if (unique.length === 0) return 0;
  const newsletter = await getNewsletterOrThrow(user, newsletterId);
  const items = await db
    .select({ id: watchItems.id })
    .from(watchItems)
    .where(and(eq(watchItems.organizationId, newsletter.organizationId), inArray(watchItems.id, unique)));
  if (items.length === 0) return 0;
  const inserted = await db
    .insert(newsletterSources)
    .values(items.map((i) => ({ organizationId: newsletter.organizationId, newsletterId, itemId: i.id })))
    .onConflictDoNothing()
    .returning({ itemId: newsletterSources.itemId });
  return inserted.length;
}

export type NewsletterSourceRow = {
  id: string;
  title: string;
  url: string;
  publisher: string;
  publishedAt: Date | null;
  country: string | null;
  summary: string | null;
};

/** Les articles rattachés à une newsletter, pour le panneau « Matière » de l'éditeur. */
export async function listNewsletterSources(user: OrgScopeUser, newsletterId: string): Promise<NewsletterSourceRow[]> {
  const newsletter = await getNewsletterOrThrow(user, newsletterId);
  return db
    .select({
      id: watchItems.id,
      title: watchItems.title,
      url: watchItems.url,
      publisher: watchItems.publisher,
      publishedAt: watchItems.publishedAt,
      country: watchItems.country,
      summary: watchItems.summary,
    })
    .from(newsletterSources)
    .innerJoin(watchItems, and(eq(watchItems.id, newsletterSources.itemId), eq(watchItems.organizationId, newsletterSources.organizationId)))
    .where(and(eq(newsletterSources.newsletterId, newsletter.id), eq(newsletterSources.organizationId, newsletter.organizationId)))
    .orderBy(asc(newsletterSources.addedAt));
}
