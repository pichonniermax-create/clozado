import { NextResponse } from "next/server";
import { z } from "zod";
import { receiveEvents, recordRejection, resolveSiteKey } from "@/db/queries/acquisition";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/events — visites et simulations, depuis le NAVIGATEUR (extrait
 * s.js). Aucune session, aucun secret : l'organisation est désignée par sa
 * clé de site publique, et la requête n'est acceptée que si l'en-tête
 * Origin du navigateur est un domaine déclaré par l'organisation
 * (fail-closed : sans domaine déclaré, rien n'est accepté). Ce qui est
 * refusé est compté par organisation avec le domaine refusé (réglages).
 *
 * Contrat versionné dans la charge (`v: 1`) — les changements sont
 * additifs ; une rupture vivra sous un autre numéro, servi en parallèle.
 * Plafonds : corps ≤ 16 Ko, ≤ 20 événements par requête ; débit :
 * 600/minute par clé de site, 120/minute par IP. Le corps arrive en
 * text/plain (sendBeacon) pour éviter le pré-vol CORS.
 */

const MAX_BODY_BYTES = 16 * 1024;
const MAX_EVENTS = 20;
const MAX_PAST_MS = 7 * 24 * 3600 * 1000;
const MAX_FUTURE_MS = 5 * 60 * 1000;

const text = (max: number) => z.string().trim().max(max).optional().nullable();

const eventSchema = z.object({
  kind: z.enum(["visit", "simulation_started", "simulation_completed"]),
  visitor_id: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  occurred_at: z.string().datetime({ offset: true }).optional().nullable(),
  page_url: text(2048),
  referrer: text(2048),
  utm_source: text(200),
  utm_medium: text(200),
  utm_campaign: text(200),
  simulator: text(200),
  origin: text(200),
});

const bodySchema = z.object({
  v: z.literal(1),
  site: z.string().regex(/^[a-f0-9]{32}$/),
  events: z.array(eventSchema).min(1).max(MAX_EVENTS),
});

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "inconnue";
}

function originHost(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  try {
    return new URL(origin).host.toLowerCase();
  } catch {
    return null;
  }
}

function corsHeaders(allowedOrigin: string | null) {
  return {
    "Cache-Control": "no-store",
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin, Vary: "Origin" } : {}),
  };
}

/** Pré-vol CORS (un fetch avec un autre type de contenu que text/plain le déclencherait) : on répond sans rien accepter d'autre. */
export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
    },
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = originHost(request);

  if (!checkRateLimit(`events:ip:${clientIp(request)}`, { limit: 120, windowMs: 60_000 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: corsHeaders(origin) });
  }
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large", limit_bytes: MAX_BODY_BYTES }, { status: 413, headers: corsHeaders(origin) });
  }
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: corsHeaders(origin) });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400, headers: corsHeaders(origin) });
  }

  const site = await resolveSiteKey(parsed.data.site);
  if (!site.ok) {
    // Clé inconnue : aucune organisation à qui l'imputer, on refuse sans rien compter.
    if (site.reason === "revoked") await recordRejection(site.organizationId, "site_key_revoked", parsed.data.site.slice(0, 8));
    return NextResponse.json({ error: "unknown_site" }, { status: 404, headers: corsHeaders(origin) });
  }
  if (!host) {
    await recordRejection(site.organizationId, "origin_missing", "(absent)");
    return NextResponse.json({ error: "origin_required" }, { status: 403, headers: corsHeaders(null) });
  }
  if (!site.allowedDomains.includes(host)) {
    await recordRejection(site.organizationId, "domain_not_allowed", host);
    return NextResponse.json({ error: "domain_not_allowed" }, { status: 403, headers: corsHeaders(null) });
  }
  if (!checkRateLimit(`events:site:${site.siteKeyId}`, { limit: 600, windowMs: 60_000 })) {
    await recordRejection(site.organizationId, "rate_limited", host);
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: corsHeaders(origin) });
  }

  const now = Date.now();
  const accepted = await receiveEvents(
    site.organizationId,
    parsed.data.events.map((e) => {
      // Une date fournie n'est acceptée que dans une fenêtre raisonnable ; sinon, maintenant.
      const at = e.occurred_at ? new Date(e.occurred_at).getTime() : NaN;
      const occurredAt = Number.isFinite(at) && at > now - MAX_PAST_MS && at < now + MAX_FUTURE_MS ? new Date(at) : new Date(now);
      return {
        kind: e.kind,
        visitorId: e.visitor_id,
        occurredAt,
        pageUrl: e.page_url ?? null,
        referrer: e.referrer ?? null,
        utmSource: e.utm_source ?? null,
        utmMedium: e.utm_medium ?? null,
        utmCampaign: e.utm_campaign ?? null,
        simulator: e.simulator ?? null,
        origin: e.origin ?? null,
      };
    })
  );
  return NextResponse.json({ accepted }, { status: 202, headers: corsHeaders(origin) });
}
