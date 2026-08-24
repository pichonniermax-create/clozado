import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { dealStatuses, pipelines, type DealStatus, type Pipeline } from "@/db/schema";
import { assertOrgAccess, orgScope } from "@/db/scope";
import type { OrgScopeUser } from "@/lib/session";

/** Les pipelines de l'organisation, avec leurs étapes ordonnées. */
export async function listPipelinesWithStages(user: OrgScopeUser) {
  const scope = orgScope(user, pipelines.organizationId);
  const pipelineQuery = db.select().from(pipelines).orderBy(asc(pipelines.position), asc(pipelines.createdAt));
  const rows: Pipeline[] = await (scope ? pipelineQuery.where(scope) : pipelineQuery);

  const stageScope = orgScope(user, dealStatuses.organizationId);
  const stageQuery = db.select().from(dealStatuses).orderBy(asc(dealStatuses.position), asc(dealStatuses.createdAt));
  const stages: DealStatus[] = await (stageScope ? stageQuery.where(stageScope) : stageQuery);

  return rows.map((p) => ({
    ...p,
    stages: stages.filter((s) => s.pipelineId === p.id),
  }));
}

export type PipelineWithStages = Awaited<ReturnType<typeof listPipelinesWithStages>>[number];

/** Slug stable et unique par pipeline, dérivé du libellé. */
function slugify(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "etape"
  );
}

export async function createPipeline(user: OrgScopeUser, label: string) {
  if (!user.organizationId) {
    throw new Error(
      "Aucune organisation sélectionnée. Choisis une organisation dans le bandeau super admin en haut de l'écran avant de créer un pipeline."
    );
  }
  const trimmed = label.trim();
  if (!trimmed) throw new Error("Le libellé du pipeline est obligatoire.");
  const [pipeline] = await db
    .insert(pipelines)
    .values({ organizationId: user.organizationId, label: trimmed, position: 99 })
    .returning();
  // Un pipeline naît avec une première étape : un pipeline sans étape ne
  // peut accueillir aucune affaire (FK composite deals → étapes).
  await db.insert(dealStatuses).values({
    organizationId: user.organizationId,
    pipelineId: pipeline.id,
    slug: "nouveau",
    label: "Nouveau",
    position: 0,
    probability: 10,
  });
  return pipeline;
}

export async function updatePipelineLabel(user: OrgScopeUser, pipelineId: string, label: string) {
  const pipeline = await db.query.pipelines.findFirst({ where: eq(pipelines.id, pipelineId) });
  if (!pipeline) throw new Error("Pipeline introuvable.");
  assertOrgAccess(user, pipeline.organizationId);
  const trimmed = label.trim();
  if (!trimmed) return;
  await db.update(pipelines).set({ label: trimmed, updatedAt: new Date() }).where(eq(pipelines.id, pipelineId));
}

export type StageInput = {
  label: string;
  color: string | null;
  probability: number | null;
  outcome: "won" | "lost" | null;
};

export async function createStage(user: OrgScopeUser, pipelineId: string, input: StageInput) {
  const pipeline = await db.query.pipelines.findFirst({ where: eq(pipelines.id, pipelineId) });
  if (!pipeline) throw new Error("Pipeline introuvable.");
  assertOrgAccess(user, pipeline.organizationId);
  const label = input.label.trim();
  if (!label) throw new Error("Le libellé de l'étape est obligatoire.");

  const siblings = await db.select().from(dealStatuses).where(eq(dealStatuses.pipelineId, pipelineId));
  const position = Math.max(-1, ...siblings.map((s) => s.position)) + 1;
  // Slug unique par pipeline : suffixe numérique si le libellé se répète.
  const base = slugify(label);
  const taken = new Set(siblings.map((s) => s.slug));
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}_${i}`;

  const [stage] = await db
    .insert(dealStatuses)
    .values({
      organizationId: pipeline.organizationId,
      pipelineId,
      slug,
      label,
      color: input.color,
      probability: input.probability,
      outcome: input.outcome,
      position,
    })
    .returning();
  return stage;
}

/** Libellé, couleur, probabilité, marqueur — jamais le pipeline ni le slug (clés de rattachement). */
export async function updateStage(user: OrgScopeUser, stageId: string, input: StageInput) {
  const stage = await db.query.dealStatuses.findFirst({ where: eq(dealStatuses.id, stageId) });
  if (!stage) throw new Error("Étape introuvable.");
  assertOrgAccess(user, stage.organizationId);
  const label = input.label.trim();
  if (!label) return;
  await db
    .update(dealStatuses)
    .set({
      label,
      color: input.color,
      probability: input.probability,
      outcome: input.outcome,
      updatedAt: new Date(),
    })
    .where(eq(dealStatuses.id, stageId));
}

/** Décale une étape d'un cran vers le haut ou le bas de SON pipeline. */
export async function moveStage(user: OrgScopeUser, stageId: string, direction: "up" | "down") {
  const stage = await db.query.dealStatuses.findFirst({ where: eq(dealStatuses.id, stageId) });
  if (!stage) throw new Error("Étape introuvable.");
  assertOrgAccess(user, stage.organizationId);

  const siblings = await db
    .select()
    .from(dealStatuses)
    .where(eq(dealStatuses.pipelineId, stage.pipelineId))
    .orderBy(asc(dealStatuses.position), asc(dealStatuses.createdAt));
  const index = siblings.findIndex((s) => s.id === stageId);
  const swapWith = siblings[direction === "up" ? index - 1 : index + 1];
  if (!swapWith) return;

  // Positions renumérotées proprement plutôt qu'échangées : deux étapes
  // héritées de la migration peuvent partager la même position.
  const reordered = [...siblings];
  [reordered[index], reordered[siblings.indexOf(swapWith)]] = [swapWith, stage];
  await db.batch(
    reordered.map((s, i) =>
      db.update(dealStatuses).set({ position: i, updatedAt: new Date() }).where(eq(dealStatuses.id, s.id))
    ) as unknown as Parameters<typeof db.batch>[0]
  );
}
