import { NextResponse } from "next/server";
import { claimSend, listResumableSends } from "@/db/queries/email-sends";
import { publicOrigin } from "@/lib/email/config";
import { runSend } from "@/lib/email/send-newsletter";

/**
 * GET /api/cron/envois — la reprise des envois (vercel.json → crons, toutes
 * les dix minutes) : les envois ouverts dont le bail est libre ou expiré
 * et dont la pause est échue sont repris un par un, dans la durée de la
 * fonction. L'envoi lui-même ne dépend pas du cron : il part à la demande,
 * après la réponse ; le cron n'est là que pour ce qu'une fonction coupée,
 * un quota ou une panne du fournisseur ont laissé en file.
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
  return NextResponse.json({ resumable: sends.length, processed: results.length, results, elapsedMs: Date.now() - started });
}
