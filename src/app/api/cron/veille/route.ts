import { NextResponse } from "next/server";
import { listStaleOrganizations } from "@/db/queries/watch";
import { refreshAllIndicators, refreshWatchNow } from "@/lib/watch/refresh";

/**
 * GET /api/cron/veille — le préchauffage quotidien (vercel.json → crons,
 * plan Pro) : les indicateurs du catalogue, puis les organisations dont
 * la collecte est périmée, une par une, dans la durée de la fonction. Ce
 * n'est qu'un préchauffage : la visite et le bouton déclenchent la même
 * collecte, une source ne dépend jamais du cron.
 *
 * Protégée par `CRON_SECRET` (Vercel l'envoie en `Authorization: Bearer`
 * aux crons) : sans la variable, la route refuse — jamais un cron ouvert.
 */
export const maxDuration = 300;

const ORGANIZATIONS_PER_RUN = 20;
const STOP_AFTER_MS = 240_000;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET absent : le cron de veille est désactivé." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const started = Date.now();
  const indicators = await refreshAllIndicators();
  const organizations = await listStaleOrganizations(ORGANIZATIONS_PER_RUN);
  const results: { id: string; status: string; report?: unknown }[] = [];
  for (const id of organizations) {
    if (Date.now() - started > STOP_AFTER_MS) break;
    const result = await refreshWatchNow(id, "cron");
    results.push({ id, status: result.status, report: "report" in result ? result.report : undefined });
  }
  return NextResponse.json({
    indicators,
    stale: organizations.length,
    processed: results.length,
    results,
    elapsedMs: Date.now() - started,
  });
}
