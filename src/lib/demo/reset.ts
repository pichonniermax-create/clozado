import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { demoResets, organizations } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { DEMO_ORGANIZATION_ID, DEMO_SLUG } from "./constants";
import { countDemoRows, createDemoOrganization, type DemoCounts } from "./seed";

/**
 * LA RÉINITIALISATION de l'organisation de démo (docs/module-demo.md §1.7,
 * périmètre validé par l'utilisateur le 2026-09-04) : UN seul ordre de
 * suppression — `DELETE FROM organizations WHERE id = <id fixe> AND is_demo`
 * — dont le prédicat est évalué par la base, et dont la cascade emporte
 * tout ce qui appartient à l'organisation (48 tables, `users` compris) ;
 * puis la re-création à l'identique (identifiants fixes) par le semis.
 * Rien d'autre n'est touché : les autres organisations (prédicat + index
 * unique + déclencheur `organizations_delete_guard`), le catalogue partagé
 * des indicateurs, les refus d'ingestion sans organisation, le journal
 * `demo_resets` (sans clé étrangère, il survit).
 *
 * Garde-fous, dans l'ordre : la confirmation explicite (le slug retapé), le
 * rôle (vérifié par l'appelant : super admin RÉEL), l'organisation MARQUÉE
 * démo (code), le prédicat `is_demo` de l'ordre (base), une seule
 * réinitialisation à la fois (journal `running`), et le journal avant/après
 * avec les comptes par table.
 */
export type DemoResetOutcome = { journalId: string; deleted: DemoCounts; created: DemoCounts; durationMs: number };

export async function resetDemoOrganization(input: { requestedBy: string | null; requestedByEmail: string | null; confirmation: string }): Promise<DemoResetOutcome> {
  if (input.confirmation.trim().toLowerCase() !== DEMO_SLUG) throw new AppError("demo.confirmation_incorrecte");
  const org = (await db.select().from(organizations).where(eq(organizations.id, DEMO_ORGANIZATION_ID)))[0];
  if (!org) throw new AppError("demo.introuvable", undefined, 404);
  if (!org.isDemo) throw new AppError("demo.pas_marquee", undefined, 403);
  const running = await db
    .select({ id: demoResets.id })
    .from(demoResets)
    .where(and(eq(demoResets.organizationId, org.id), eq(demoResets.status, "running")));
  if (running.length > 0) throw new AppError("demo.reinitialisation_en_cours", undefined, 409);

  const started = Date.now();
  const deleted = await countDemoRows(org.id);
  const [entry] = await db
    .insert(demoResets)
    .values({ organizationId: org.id, organizationSlug: org.slug, requestedBy: input.requestedBy, requestedByEmail: input.requestedByEmail, kind: "reset", status: "running", deleted })
    .returning({ id: demoResets.id });
  try {
    // LA suppression : la base évalue `is_demo` dans le même ordre que la suppression — même appelé avec
    // l'id fixe d'une organisation qui aurait perdu sa marque, rien ne partirait (et le déclencheur refuserait).
    const gone = await db
      .delete(organizations)
      .where(and(eq(organizations.id, org.id), eq(organizations.isDemo, true)))
      .returning({ id: organizations.id });
    if (gone.length !== 1) throw new AppError("demo.pas_marquee", undefined, 403);
    // La re-création garde l'état de l'interrupteur : une démo publique le reste après sa remise à zéro.
    const result = await createDemoOrganization({ demoPublicEnabled: org.demoPublicEnabled });
    await db.update(demoResets).set({ status: "done", finishedAt: new Date(), created: result.counts }).where(eq(demoResets.id, entry.id));
    return { journalId: entry.id, deleted, created: result.counts, durationMs: Date.now() - started };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.update(demoResets).set({ status: "failed", finishedAt: new Date(), error: message.slice(0, 2000) }).where(eq(demoResets.id, entry.id));
    throw error;
  }
}
