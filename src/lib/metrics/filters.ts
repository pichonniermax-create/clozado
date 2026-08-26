import { sql, type SQL } from "drizzle-orm";
import type { OrgScopeUser } from "@/lib/session";
import { AppError } from "@/lib/errors";

/**
 * Les filtres communs à toute vue analytique. La PÉRIODE s'applique à
 * l'événement qui CLÔT l'observation (fin de passage, signature, réponse,
 * règlement, première interaction) — ou, pour une cohorte, à l'événement
 * qui y fait ENTRER (création de l'affaire, arrivée du lead) : « ce qui
 * s'est conclu / ce qui a commencé entre ces dates ». Conseiller, type et
 * pipeline sont lus sur l'affaire telle qu'elle est aujourd'hui (valeur
 * courante — les réaffectations ne sont pas historisées, assumé).
 * L'ORIGINE d'une affaire est celle de son lead (`deals.lead_id`, posé à la
 * création ou rattaché à la main) ; le filtre accepte aussi deux valeurs
 * spéciales, jamais des identifiants : `ORIGIN_UNKNOWN` (affaires sans
 * lead) et `ORIGIN_UNMATCHED` (lead reçu avec un texte qui n'est rattaché à
 * aucune origine configurée).
 */
export type MetricFilters = {
  from?: Date;
  to?: Date;
  ownerId?: string;
  typeId?: string;
  pipelineId?: string;
  originId?: string;
};

/** Filtre origine : les affaires SANS lead (origine inconnue). */
export const ORIGIN_UNKNOWN = "inconnue";
/** Filtre origine : lead reçu avec un texte non rattaché (Analytique → Origines, « à rapprocher »). */
export const ORIGIN_UNMATCHED = "a-rapprocher";

/**
 * L'analytique n'a de sens que rapportée à UNE organisation. Jamais le mode
 * « voit tout » d'orgScope : un agrégat ne traverse pas la frontière entre
 * deux clients, même pour un super admin — il choisit une organisation.
 */
export function organizationOf(user: OrgScopeUser): string {
  if (!user.organizationId) {
    throw new AppError("l_analytique_se_calcule_pour_une_organisation_32f8");
  }
  return user.organizationId;
}

/** L'alias par défaut de la table des affaires dans les requêtes de la couche. */
const DEAL = sql`d`;

/**
 * Conditions sur l'affaire (alias `d` par défaut — la liste des affaires
 * passe sa propre référence de table) : organisation, puis filtres.
 * Toujours au moins l'organisation.
 */
export function dealConditions(organizationId: string, filters: MetricFilters, d: SQL = DEAL): SQL {
  const parts: SQL[] = [sql`${d}.organization_id = ${organizationId}`];
  if (filters.ownerId) parts.push(sql`${d}.owner_id = ${filters.ownerId}`);
  if (filters.typeId) parts.push(sql`${d}.type_id = ${filters.typeId}`);
  if (filters.pipelineId) parts.push(sql`${d}.pipeline_id = ${filters.pipelineId}`);
  if (filters.originId) parts.push(dealOriginCondition(organizationId, filters.originId, d));
  return sql.join(parts, sql` AND `);
}

/** L'origine d'une affaire est celle de son lead — la sous-requête reste bornée par l'organisation. */
function dealOriginCondition(organizationId: string, originId: string, d: SQL): SQL {
  if (originId === ORIGIN_UNKNOWN) return sql`${d}.lead_id IS NULL`;
  return sql`${d}.lead_id IN (SELECT l.id FROM leads l WHERE l.organization_id = ${organizationId} AND ${leadOriginCondition(sql`l`, originId)})`;
}

/**
 * Condition sur un lead — ou un événement de visite, mêmes colonnes —
 * (alias fourni) pour une valeur du filtre origine. « Sans lead » n'a pas
 * de sens sur un lead : condition toujours fausse.
 */
export function leadOriginCondition(lead: SQL, originId: string): SQL {
  if (originId === ORIGIN_UNKNOWN) return sql`FALSE`;
  if (originId === ORIGIN_UNMATCHED) return sql`${lead}.origin_id IS NULL`;
  return sql`${lead}.origin_id = ${originId}`;
}

/**
 * Conditions sur le contact (`c`) pour les métriques qui se mesurent AVANT
 * toute affaire : organisation, puis le conseiller responsable de la fiche.
 * Type et pipeline n'ont pas d'objet ici — le registre le dit.
 */
export function contactConditions(organizationId: string, filters: MetricFilters): SQL {
  const parts: SQL[] = [sql`c.organization_id = ${organizationId}`];
  if (filters.ownerId) parts.push(sql`c.owner_id = ${filters.ownerId}`);
  return sql.join(parts, sql` AND `);
}

/** La période, appliquée à la colonne qui clôt (ou ouvre) l'observation. `TRUE` sans borne. */
export function periodCondition(column: SQL, filters: MetricFilters): SQL {
  const parts: SQL[] = [];
  if (filters.from) parts.push(sql`${column} >= ${filters.from}`);
  if (filters.to) parts.push(sql`${column} < ${filters.to}`);
  return parts.length === 0 ? sql`TRUE` : sql.join(parts, sql` AND `);
}
