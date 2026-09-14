import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { unsubscribeByMessage } from "@/lib/email/unsubscribe";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/unsubscribe/[id] — la désinscription EN UN CLIC (RFC 8058) :
 * l'adresse de l'en-tête `List-Unsubscribe`, que Gmail ou Yahoo appellent
 * quand la personne clique « Se désabonner » dans leur interface, avec le
 * corps `List-Unsubscribe=One-Click`. Le seul geste : désinscrire — la
 * même fonction que la page. Un GET ne désinscrit jamais (un robot qui
 * pré-visite les liens ne doit rien changer) : il renvoie vers la page.
 *
 * Le corps est EXIGÉ (audit, constat S11) : c'est lui qui distingue le
 * geste d'une messagerie d'un POST quelconque qui porterait l'identifiant
 * (un lien pré-visité par un robot, un formulaire rejoué). Sans lui, rien
 * n'est écrit — 400, et la page reste le chemin d'une personne.
 */
async function isOneClickBody(request: Request): Promise<boolean> {
  const body = await request.text().catch(() => "");
  if (!body || body.length > 1024) return false;
  return new URLSearchParams(body).get("List-Unsubscribe") === "One-Click";
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "invalid" }, { status: 404 });
  if (!checkRateLimit(`unsub:ip:${clientIp(request.headers)}`, { limit: 30, windowMs: 60_000 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  if (!(await isOneClickBody(request))) {
    return NextResponse.json({ error: "one_click_body_required" }, { status: 400 });
  }
  const outcome = await unsubscribeByMessage(id, "one_click");
  if (outcome.kind === "invalid") return NextResponse.json({ error: "invalid" }, { status: 404 });
  return NextResponse.json({ outcome: outcome.kind });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return NextResponse.redirect(new URL(`/desinscription/${encodeURIComponent(id)}`, _request.url), 303);
}
