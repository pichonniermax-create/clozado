import { NextResponse } from "next/server";
import { claimSend, listResumableSends } from "@/db/queries/email-sends";
import { listOrganizationsWithActiveRules } from "@/db/queries/rules";
import { publicOrigin } from "@/lib/email/config";
import { runSend } from "@/lib/email/send-newsletter";
import { evaluateOrganizationRules } from "@/lib/rules/evaluate";

/**
 * GET /api/cron/envois — la reprise des envois (vercel.json → crons,
 * quotidien — plan Hobby) : les envois ouverts dont le bail est libre ou
 * expiré et dont la pause est échue sont repris un par un, dans la durée
 * de la fonction. L'envoi lui-même ne dépend pas du cron : il part à la
 * demande, après la réponse ; le cron n'est là que pour ce qu'une fonction
 * coupée, un quota ou une panne du fournisseur ont laissé en file.
 *
 * PUIS l'évaluation quotidienne des règles (Partie 3) — APRÈS les
 * newsletters en file, comme l'exige le §3.7. Le plan Hobby n'accepte que
 * deux crons quotidiens (veille, envois) : le cron horaire du cahier
 * (`/api/cron/regles`) redeviendra possible au production-ready, en plan
 * Pro — l'évaluation s'extraira d'ici sans rien changer au moteur.
 * L'évaluation n'ENVOIE rien : elle prépare tâches, notifications et
 * brouillons ; la vague d'emails automatiques attend un clic humain.
 *
 * Protégée par `CRON_SECRET` (Vercel l'envoie en `Authorization: Bearer`) :
 * sans la variable, la route refuse — jamais un cron ouvert.
 */
export const maxDuration = 300;

const STOP_AFTER_MS = 250_000;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // eslint-disable-next-line local/no-visible-text -- réponse à une machine (le cron), jamais lue par une personne
    return NextResponse.json({ error: "CRON_SECRET absent : le cron des envois est désactivé." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    // eslint-disable-next-line local/no-visible-text -- réponse à une machine (le cron), jamais lue par une personne
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  const started = Date.now();
  const origin = await publicOrigin();
  const sends = await listResumableSends();
  const results: { id: string; outcome: string }[] = [];
  for (const send of sends) {
    if (Date.now() - started > STOP_AFTER_MS) break;
    const claimed = await claimSend(send.id);
    if (!claimed) {
      results.push({ id: send.id, outcome: "busy" });
      continue;
    }
    const outcome = await runSend(send.id, origin, { alreadyClaimed: true });
    results.push({ id: send.id, outcome });
  }
  const ruleOrganizations = await listOrganizationsWithActiveRules();
  const ruleResults: { id: string; status: string }[] = [];
  for (const organizationId of ruleOrganizations) {
    const remaining = STOP_AFTER_MS - (Date.now() - started);
    if (remaining <= 0) break;
    const summary = await evaluateOrganizationRules(organizationId, "cron", { origin, budgetMs: remaining });
    ruleResults.push({ id: organizationId, status: summary.status });
  }

  return NextResponse.json({
    resumable: sends.length,
    processed: results.length,
    results,
    rules: { organizations: ruleOrganizations.length, results: ruleResults },
    elapsedMs: Date.now() - started,
  });
}
