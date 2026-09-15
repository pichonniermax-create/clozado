import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { contacts, deals, mailTargets, newsletters, organizationAssets, organizations, partners, rules } from "@/db/schema";
import type { OnboardingFacts } from "@/lib/onboarding/steps";
import type { OrgScopeUser } from "@/lib/session";

/**
 * Les champs de la requête des premiers pas, à part pour être TESTÉS sans
 * base (`onboarding.test.ts`) : chaque sous-requête compare
 * `organization_id` au PARAMÈTRE LIÉ `organizationId`, jamais à la colonne
 * `${organizations.id}` — dans un fragment `sql` posé dans `select()`,
 * Drizzle rend cette colonne comme l'identifiant NU `"id"`, que Postgres
 * lie à la table la plus proche (`c.id`) : toujours faux, donc zéro
 * partout, et la carte « Premiers pas » disait 1 sur 8 à un cabinet de 44
 * contacts (audit UI du 2026-09-14). Chaque compte s'arrête à la première
 * ligne (`LIMIT 1`) : c'est une existence, pas un dénombrement.
 */
export function onboardingFactsFields(organizationId: string) {
  const exists = (table: unknown, alias: string) =>
    sql<number>`(SELECT count(*)::int FROM (SELECT 1 FROM ${table as typeof contacts} ${sql.raw(alias)} WHERE ${sql.raw(alias)}.organization_id = ${organizationId} LIMIT 1) ${sql.raw(`${alias}_x`)})`;
  return {
    brandSet: sql<boolean>`(${organizations.primaryColor} IS NOT NULL OR EXISTS (SELECT 1 FROM ${organizationAssets} a WHERE a.organization_id = ${organizationId}))`,
    emailDomainVerified: sql<boolean>`(${organizations.emailDomainVerifiedAt} IS NOT NULL)`,
    contacts: sql<number>`(SELECT count(*)::int FROM (SELECT 1 FROM ${contacts} c WHERE c.organization_id = ${organizationId} AND c.deleted_at IS NULL LIMIT 1) c_x)`,
    partners: exists(partners, "p"),
    deals: exists(deals, "d"),
    targets: exists(mailTargets, "t"),
    newsletters: exists(newsletters, "n"),
    rules: exists(rules, "r"),
  };
}

/**
 * Les FAITS des premiers pas (src/lib/onboarding/steps.ts) en UNE requête
 * SQL : huit existences dans l'organisation de la personne. Le WHERE porte
 * sur `user.organizationId`, jamais sur un identifiant reçu ; sans
 * organisation (vue globale), tout est faux.
 */
export async function getOnboardingFacts(user: OrgScopeUser): Promise<OnboardingFacts> {
  const organizationId = user.organizationId;
  const none: OnboardingFacts = { brandSet: false, contacts: 0, partners: 0, deals: 0, targets: 0, newsletters: 0, rules: 0, emailDomainVerified: false };
  if (!organizationId) return none;
  const [row] = await db.select(onboardingFactsFields(organizationId)).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
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
