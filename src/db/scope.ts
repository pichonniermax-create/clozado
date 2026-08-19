import { eq, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { OrgScopeUser } from "@/lib/session";

/**
 * LE garde-fou générique à utiliser dans toute requête (lecture ou
 * écriture) sur une table métier possédant une colonne organization_id.
 * C'est la brique sur laquelle chaque futur outil (email marketing,
 * contacts, etc.) doit s'appuyer pour hériter automatiquement de
 * l'isolation entre organisations.
 *
 * - super_admin : aucun filtre (undefined), il voit/gère tout
 * - admin / membre : filtre strictement sur SA organisation
 * - filet de sécurité : un admin/membre sans organisation (ne devrait
 *   jamais arriver, contrainte en base) obtient une condition toujours
 *   fausse plutôt qu'un accès non filtré
 *
 * Usage :
 *   db.select().from(campagnes).where(orgScope(user, campagnes.organizationId))
 *   db.update(campagnes).set(...).where(orgScope(user, campagnes.organizationId))
 */
export function orgScope(
  user: OrgScopeUser,
  organizationIdColumn: AnyPgColumn
): SQL | undefined {
  if (user.role === "super_admin") {
    return undefined;
  }
  if (!user.organizationId) {
    return sql`false`;
  }
  return eq(organizationIdColumn, user.organizationId);
}

/**
 * À utiliser juste après avoir récupéré UNE donnée précise par son id
 * (ex: "cette campagne existe, mais est-elle bien à moi ?"). Lève une
 * erreur si elle appartient à une autre organisation. Complète orgScope
 * pour les cas où la donnée a déjà été chargée autrement qu'en filtrant
 * la requête elle-même.
 */
export function assertOrgAccess(
  user: OrgScopeUser,
  recordOrganizationId: string | null
): void {
  if (user.role === "super_admin") return;
  if (!user.organizationId || recordOrganizationId !== user.organizationId) {
    throw new Error(
      "Accès refusé : cette donnée n'appartient pas à ton organisation."
    );
  }
}
