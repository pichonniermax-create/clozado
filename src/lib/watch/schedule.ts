import { after } from "next/server";
import { startWatchRun, type StartRunResult } from "@/db/queries/watch";
import { executeWatchRun } from "./refresh";

/**
 * Le seul module de la veille qui connaît le cadre (`next/server`) :
 * `refresh.ts` reste appelable depuis un script ou le cron sans lui.
 *
 * Démarre maintenant (la ligne de collecte existe dès le retour, l'écran
 * peut dire « collecte en cours ») et exécute APRÈS la réponse (`after()`,
 * tenu en vie par la plateforme jusqu'au `maxDuration` de la route) : la
 * page ne ralentit jamais.
 */
export async function scheduleWatchRefresh(organizationId: string, trigger: "visit" | "manual"): Promise<StartRunResult> {
  const start = await startWatchRun(organizationId, trigger);
  if (start.status === "started") {
    const run = start.run;
    after(async () => {
      await executeWatchRun(run);
    });
  }
  return start;
}
