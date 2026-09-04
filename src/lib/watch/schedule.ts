import { after } from "next/server";
import { getRunningRun, startWatchRun, type StartRunResult } from "@/db/queries/watch";
import { isDemoOrganization } from "@/lib/demo/guard";
import { executeWatchRun } from "./refresh";

/**
 * Le seul module de la veille qui connaît le cadre (`next/server`) :
 * `refresh.ts` reste appelable depuis un script ou le cron sans lui.
 *
 * Démarre maintenant (la ligne de collecte existe dès le retour, l'écran
 * peut dire « collecte en cours ») et exécute APRÈS la réponse (`after()`,
 * tenu en vie par la plateforme jusqu'au `maxDuration` de la route) : la
 * page ne ralentit jamais.
 *
 * `queue` : quand une collecte est déjà en cours, en démarrer une autre
 * dès qu'elle finit (au plus cent secondes d'attente) — pour qu'une
 * source ajoutée pendant une collecte soit lue tout de suite après, pas
 * le lendemain. Deux ajouts pendant la même collecte font deux attentes,
 * une seule collecte : le verrou en base ne laisse passer que la
 * première, qui lit toutes les sources dues.
 */
export async function scheduleWatchRefresh(organizationId: string, trigger: "visit" | "manual", opts: { queue?: boolean } = {}): Promise<StartRunResult> {
  if (await isDemoOrganization(organizationId)) return { status: "demo" };
  const start = await startWatchRun(organizationId, trigger);
  if (start.status === "started") {
    const run = start.run;
    after(async () => {
      await executeWatchRun(run);
    });
  } else if (start.status === "running" && opts.queue) {
    after(async () => {
      const deadline = Date.now() + QUEUE_WAIT_MS;
      while (Date.now() < deadline && (await getRunningRun(organizationId))) {
        await new Promise((resolve) => setTimeout(resolve, QUEUE_POLL_MS));
      }
      const next = await startWatchRun(organizationId, "visit");
      if (next.status === "started") await executeWatchRun(next.run);
    });
  }
  return start;
}

const QUEUE_WAIT_MS = 100_000;
const QUEUE_POLL_MS = 5_000;
