import { NextResponse } from "next/server";
import { z } from "zod";
import { applyPublicShareAction, resolvePublicShare } from "@/db/queries/deal-shares-public";
import { checkRateLimit } from "@/lib/deal-shares/rate-limit";

/**
 * SEULE ROUTE PUBLIQUE, SANS SESSION, DU PRODUIT — accès par jeton
 * uniquement (voir src/db/queries/deal-shares-public.ts pour l'exception à
 * orgScope elle-même). Ce fichier ne fait que : rate-limiter, valider la
 * forme de l'entrée, appeler le module isolé, et sérialiser sa sortie
 * telle quelle — aucune requête base de données directement ici, aucune
 * logique d'autorisation ici : tout ça vit dans le module isolé.
 *
 * `auth()` n'est délibérément JAMAIS appelé dans ce fichier.
 */

const HEADERS = {
  // Aucune indexation par un moteur de recherche — un lien de partage n'est
  // pas une page publique à découvrir.
  "X-Robots-Tag": "noindex, nofollow",
  // Le jeton est dans l'URL : un lien sortant depuis cette réponse ne doit
  // jamais le faire fuiter via l'en-tête Referer d'un tiers.
  "Referrer-Policy": "no-referrer",
};

function clientKey(request: Request, token: string) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  // Deux angles cumulés : par IP (abus général) et par jeton (acharnement
  // sur UN partage précis, même depuis des IP différentes).
  return { ipKey: `ip:${ip}`, tokenKey: `token:${token}` };
}

function rateLimited(request: Request, token: string): boolean {
  const { ipKey, tokenKey } = clientKey(request, token);
  // Fenêtres volontairement larges : ce n'est pas la défense contre le
  // brute-force (l'entropie du jeton l'est déjà), juste un frein à l'abus.
  const ipOk = checkRateLimit(ipKey, { limit: 60, windowMs: 60_000 });
  const tokenOk = checkRateLimit(tokenKey, { limit: 30, windowMs: 60_000 });
  return !(ipOk && tokenOk);
}

function resultToResponse(result: { ok: true; view: unknown } | { ok: false; reason: string }) {
  if (result.ok) {
    return NextResponse.json({ share: result.view }, { headers: HEADERS });
  }
  const status =
    result.reason === "not_found"
      ? 404
      : result.reason === "revoked" || result.reason === "expired"
        ? 410
        : 409; // already_resolved
  return NextResponse.json({ error: result.reason }, { status, headers: HEADERS });
}

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;

  if (rateLimited(request, token)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: HEADERS });
  }

  const result = await resolvePublicShare(token);
  return resultToResponse(result);
}

const actionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("accept") }),
  z.strictObject({ type: z.literal("decline"), reason: z.string().max(500).optional() }),
  z.strictObject({ type: z.literal("status_change"), statusId: z.uuid() }),
  z.strictObject({ type: z.literal("comment"), message: z.string().min(1).max(2000) }),
]);

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;

  if (rateLimited(request, token)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: HEADERS });
  }

  const rawBody = await request.json().catch(() => null);
  const body = actionSchema.safeParse(rawBody);
  if (!body.success) {
    return NextResponse.json({ error: "invalid_action" }, { status: 400, headers: HEADERS });
  }

  const result = await applyPublicShareAction(token, body.data);
  return resultToResponse(result);
}
