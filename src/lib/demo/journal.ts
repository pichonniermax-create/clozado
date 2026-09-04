import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { demoResets } from "@/db/schema";
import { DEMO_ORGANIZATION_ID, DEMO_SLUG } from "./constants";
import type { DemoCounts } from "./seed";

/**
 * Le journal `demo_resets` autour d'une création (docs/module-demo.md
 * §1.1) : une ligne `running` avant, `done` avec les comptes après, `failed`
 * avec l'erreur si le semis s'interrompt — rien ne se passe sans trace.
 * La réinitialisation (§1.7) réutilisera le même enveloppement avec
 * `kind: "reset"` et les comptes d'avant suppression.
 */
export async function recordDemoSeed(
  who: { requestedBy: string | null; requestedByEmail: string | null },
  work: () => Promise<{ organizationId: string; counts: DemoCounts }>
): Promise<{ organizationId: string; counts: DemoCounts; journalId: string }> {
  const [entry] = await db
    .insert(demoResets)
    .values({ organizationId: DEMO_ORGANIZATION_ID, organizationSlug: DEMO_SLUG, requestedBy: who.requestedBy, requestedByEmail: who.requestedByEmail, kind: "seed", status: "running" })
    .returning({ id: demoResets.id });
  try {
    const result = await work();
    await db.update(demoResets).set({ status: "done", finishedAt: new Date(), created: result.counts }).where(eq(demoResets.id, entry.id));
    return { ...result, journalId: entry.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.update(demoResets).set({ status: "failed", finishedAt: new Date(), error: message.slice(0, 2000) }).where(eq(demoResets.id, entry.id));
    throw error;
  }
}

export async function listDemoJournal(limit = 5) {
  return db.select().from(demoResets).orderBy(desc(demoResets.startedAt)).limit(limit);
}
