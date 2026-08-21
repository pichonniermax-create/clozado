import { randomUUID } from "crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { dealStatuses, pipelines } from "@/db/schema";
import { orgScope } from "@/db/scope";
import type { OrgScopeUser } from "@/lib/session";

/** Statuts d'affaire de l'organisation de l'appelant, dans leur ordre d'affichage. */
export async function listDealStatuses(user: OrgScopeUser) {
  const scope = orgScope(user, dealStatuses.organizationId);
  const query = db.select().from(dealStatuses).orderBy(asc(dealStatuses.position));
  return scope ? query.where(scope) : query;
}

/**
 * Valeurs par défaut créées à la création d'une organisation — pas un
 * contenu figé dans le code applicatif au-delà de cet instant : modifiable
 * ensuite comme n'importe quelle ligne de `deal_statuses`. Volontairement
 * PAS d'équivalent pour `deal_types` : un CGP et un courtier crédit n'ont
 * rien en commun sur ce vocabulaire, deviner un défaut serait arbitraire.
 */
const DEFAULT_STATUSES = [
  { slug: "nouveau", label: "Nouveau", color: "#64748b", probability: 10, outcome: null },
  { slug: "partagee", label: "Partagée", color: "#2563eb", probability: 25, outcome: null },
  { slug: "en_negociation", label: "En négociation", color: "#d97706", probability: 60, outcome: null },
  { slug: "acceptee", label: "Acceptée", color: "#16a34a", probability: 100, outcome: "won" as const },
  { slug: "perdue", label: "Perdue", color: "#dc2626", probability: 0, outcome: "lost" as const },
] as const;

/**
 * Les requêtes d'insertion du pipeline par défaut ET de ses étapes, NON
 * exécutées — pour pouvoir les joindre à un `db.batch()` avec la création
 * de l'organisation (voir `createOrganizationWithAdmin`). Sans elles, une
 * organisation neuve existe mais `getDefaultDealStatus` lève à la première
 * affaire créée : tout doit naître ensemble ou pas du tout. L'id du
 * pipeline est généré côté application : le batch neon-http ne permet pas
 * de lire un retour d'insertion pour nourrir la suivante.
 */
export function buildDefaultPipelineInserts(organizationId: string) {
  const pipelineId = randomUUID();
  return [
    db.insert(pipelines).values({ id: pipelineId, organizationId, label: "Affaires", position: 0 }),
    db
      .insert(dealStatuses)
      .values(DEFAULT_STATUSES.map((s, position) => ({ organizationId, pipelineId, position, ...s }))),
  ] as const;
}

/** À appeler une fois, à la création d'une organisation (hors batch — scripts de seed). */
export async function seedDefaultDealStatuses(organizationId: string) {
  const [pipelineInsert, statusesInsert] = buildDefaultPipelineInserts(organizationId);
  await pipelineInsert;
  await statusesInsert;
}

/**
 * Le statut par défaut ("nouveau") d'une organisation, utilisé à la
 * création d'une affaire. Tant que l'écran de création ne propose pas de
 * choisir un pipeline (étape 4 du module relationnel), on prend le
 * "nouveau" du premier pipeline trouvé — une organisation n'en a qu'un
 * aujourd'hui.
 */
export async function getDefaultDealStatus(organizationId: string) {
  const status = await db.query.dealStatuses.findFirst({
    where: and(eq(dealStatuses.organizationId, organizationId), eq(dealStatuses.slug, "nouveau")),
  });
  if (!status) {
    throw new Error('Statut par défaut ("nouveau") introuvable pour cette organisation.');
  }
  return status;
}
