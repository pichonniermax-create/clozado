import { sql, type SQL } from "drizzle-orm";
import type { OrgScopeUser } from "@/lib/session";

/**
 * Les filtres communs à toute vue analytique. La PÉRIODE s'applique à
 * l'événement qui CLÔT l'observation (fin de passage, signature, réponse,
 * règlement) : « ce qui s'est conclu entre ces dates ». Conseiller, type et
 * pipeline sont lus sur l'affaire telle qu'elle est aujourd'hui (valeur
 * courante — les réaffectations ne sont pas historisées, assumé).
 */
export type MetricFilters = {
  from?: Date;
  to?: Date;
  ownerId?: string;
  typeId?: string;
  pipelineId?: string;
  /** Origine (lead) — sans effet tant que l'entrée des leads n'existe pas (migration B). */
  originId?: string;
};

/**
 * L'analytique n'a de sens que rapportée à UNE organisation. Jamais le mode
 * « voit tout » d'orgScope : un agrégat ne traverse pas la frontière entre
 * deux clients, même pour un super admin — il choisit une organisation.
 */
export function organizationOf(user: OrgScopeUser): string {
  if (!user.organizationId) {
    throw new Error(
      "L'analytique se calcule pour une organisation précise. Choisis une organisation dans le bandeau super admin en haut de l'écran."
    );
  }
  return user.organizationId;
}

/** Conditions sur l'affaire (`d`) : organisation, puis filtres. Toujours au moins l'organisation. */
export function dealConditions(organizationId: string, filters: MetricFilters): SQL {
  const parts: SQL[] = [sql`d.organization_id = ${organizationId}`];
  if (filters.ownerId) parts.push(sql`d.owner_id = ${filters.ownerId}`);
  if (filters.typeId) parts.push(sql`d.type_id = ${filters.typeId}`);
  if (filters.pipelineId) parts.push(sql`d.pipeline_id = ${filters.pipelineId}`);
  return sql.join(parts, sql` AND `);
}

/** La période, appliquée à la colonne qui clôt l'observation. `TRUE` sans borne. */
export function periodCondition(column: SQL, filters: MetricFilters): SQL {
  const parts: SQL[] = [];
  if (filters.from) parts.push(sql`${column} >= ${filters.from}`);
  if (filters.to) parts.push(sql`${column} < ${filters.to}`);
  return parts.length === 0 ? sql`TRUE` : sql.join(parts, sql` AND `);
}
