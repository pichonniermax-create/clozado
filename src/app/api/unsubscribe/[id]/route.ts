import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { unsubscribeByMessage } from "@/lib/email/unsubscribe";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "inconnue";
}

/**
 * POST /api/unsubscribe/[id] — la désinscription EN UN CLIC (RFC 8058) :
 * l'adresse de l'en-tête `List-Unsubscribe`, que Gmail ou Yahoo appellent
 * quand la personne clique « Se désabonner » dans leur interface, avec le
 * corps `List-Unsubscribe=One-Click`. Le seul geste : désinscrire — la
 * même fonction que la page. Un GET ne désinscrit jamais (un robot qui
 * pré-visite les liens ne doit rien changer) : il renvoie vers la page.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "invalid" }, { status: 404 });
  if (!checkRateLimit(`unsub:ip:${clientIp(request)}`, { limit: 30, windowMs: 60_000 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const outcome = await unsubscribeByMessage(id, "one_click");
  if (outcome.kind === "invalid") return NextResponse.json({ error: "invalid" }, { status: 404 });
  return NextResponse.json({ outcome: outcome.kind });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return NextResponse.redirect(new URL(`/desinscription/${encodeURIComponent(id)}`, _request.url), 303);
}
