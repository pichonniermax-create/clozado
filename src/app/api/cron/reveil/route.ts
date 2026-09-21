import { NextResponse } from "next/server";
import { claimSend, listResumableSends } from "@/db/queries/email-sends";
import { publicOrigin } from "@/lib/email/config";
import { runSend } from "@/lib/email/send-newsletter";

/**
 * GET /api/cron/reveil — LE RÉVEIL HORAIRE DES ENVOIS (chantier envoi,
 * partie 4, décision P4-1 : un workflow planifié de GitHub appelle cette
 * route toutes les heures, `.github/workflows/reveil.yml`).
 *
 * Pourquoi une route à part, et pas `/api/cron/envois` : celle-là fait
 * DEUX choses — reprendre les envois, puis évaluer les règles de chaque
 * organisation. L'appeler toutes les heures changerait la cadence des
 * règles, qui est une décision de produit, pas un effet de bord d'un
 * réveil. Ici, une seule chose : les envois en file dont l'heure est
 * venue.
 *
 * Ce qu'elle apporte AVANT même les départs programmés : un envoi
 * interrompu (fonction coupée, quota du fournisseur, panne) attendait
 * jusqu'au passage quotidien de 6 h ; il repart désormais dans l'heure.
 *
 * Mêmes gardes que l'autre cron : `CRON_SECRET` obligatoire (sans la
 * variable, la route refuse — jamais un cron ouvert), et rien dans la
 * réponse qui nommerait une organisation ou une personne : le journal
 * d'un workflow de dépôt public se lit par tout le monde.
 */
export const maxDuration = 300;

const STOP_AFTER_MS = 250_000;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // eslint-disable-next-line local/no-visible-text -- réponse à une machine (le cron), jamais lue par une personne
    return NextResponse.json({ error: "CRON_SECRET absent : le réveil des envois est désactivé." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    // eslint-disable-next-line local/no-visible-text -- réponse à une machine (le cron), jamais lue par une personne
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const started = Date.now();
  const origin = await publicOrigin();
  const sends = await listResumableSends();
  const outcomes: Record<string, number> = {};
  for (const send of sends) {
    if (Date.now() - started > STOP_AFTER_MS) break;
    const claimed = await claimSend(send.id);
    const outcome = claimed ? await runSend(send.id, origin, { alreadyClaimed: true }) : "busy";
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
  }
  // Des NOMBRES, jamais d'identifiants : ce corps finit dans un journal public.
  return NextResponse.json({ resumable: sends.length, outcomes, elapsedMs: Date.now() - started });
}
