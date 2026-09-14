import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts, deals, mailTargets, newsletters, organizationAssets, organizations, partners, rules } from "@/db/schema";
import type { OnboardingFacts } from "@/lib/onboarding/steps";
import type { OrgScopeUser } from "@/lib/session";

/**
 * Les FAITS des premiers pas (src/lib/onboarding/steps.ts) en UNE requête
 * SQL : huit existences dans l'organisation de la personne — pas huit
 * comptages, `EXISTS` s'arrête à la première ligne. Le WHERE porte sur
 * `user.organizationId`, jamais sur un identifiant reçu ; sans
 * organisation (vue globale), tout est faux.
 */
export async function getOnboardingFacts(user: OrgScopeUser): Promise<OnboardingFacts> {
  const organizationId = user.organizationId;
  const none: OnboardingFacts = { brandSet: false, contacts: 0, partners: 0, deals: 0, targets: 0, newsletters: 0, rules: 0, emailDomainVerified: false };
  if (!organizationId) return none;
  const [row] = await db
    .select({
      brandSet: sql<boolean>`(${organizations.primaryColor} IS NOT NULL OR EXISTS (SELECT 1 FROM ${organizationAssets} a WHERE a.organization_id = ${organizations.id}))`,
      emailDomainVerified: sql<boolean>`(${organizations.emailDomainVerifiedAt} IS NOT NULL)`,
      contacts: sql<number>`(SELECT count(*)::int FROM ${contacts} c WHERE c.organization_id = ${organizations.id} AND c.deleted_at IS NULL)`,
      partners: sql<number>`(SELECT count(*)::int FROM ${partners} p WHERE p.organization_id = ${organizations.id})`,
      deals: sql<number>`(SELECT count(*)::int FROM ${deals} d WHERE d.organization_id = ${organizations.id})`,
      targets: sql<number>`(SELECT count(*)::int FROM ${mailTargets} t WHERE t.organization_id = ${organizations.id})`,
      newsletters: sql<number>`(SELECT count(*)::int FROM ${newsletters} n WHERE n.organization_id = ${organizations.id})`,
      rules: sql<number>`(SELECT count(*)::int FROM ${rules} r WHERE r.organization_id = ${organizations.id})`,
    })
    .from(organizations)
    .where(and(eq(organizations.id, organizationId), isNull(sql`NULL`)))
    .limit(1);
  if (!row) return none;
  return {
    brandSet: Boolean(row.brandSet),
    emailDomainVerified: Boolean(row.emailDomainVerified),
    contacts: Number(row.contacts),
    partners: Number(row.partners),
    deals: Number(row.deals),
    targets: Number(row.targets),
    newsletters: Number(row.newsletters),
    rules: Number(row.rules),
  };
}
