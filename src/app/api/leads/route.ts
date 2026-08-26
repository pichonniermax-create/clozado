import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiKey, receiveLead, recordRejection } from "@/db/queries/acquisition";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/leads — l'entrée des leads, SERVEUR À SERVEUR uniquement :
 * authentifiée par une clé d'API (Authorization: Bearer clz_…), jamais
 * appelée depuis un navigateur (la clé est un secret). Ce fichier ne fait
 * que : limiter le débit, borner la taille, valider la forme, appeler la
 * réception, sérialiser — l'organisation est celle de la clé, jamais un
 * paramètre. Ce qui est refusé est compté par organisation (réglages).
 *
 * Plafonds : corps ≤ 64 Ko ; `payload` (réponses de la simulation) ≤ 16 Ko
 * sérialisé et ≤ 200 clés au premier niveau — au-delà, 413 payload_too_large,
 * rien n'est enregistré. Débit : 120 requêtes/minute par clé et par IP.
 */

const MAX_BODY_BYTES = 64 * 1024;
const MAX_PAYLOAD_BYTES = 16 * 1024;
const MAX_PAYLOAD_KEYS = 200;

const HEADERS = { "Cache-Control": "no-store" };

const text = (max: number) => z.string().trim().max(max).optional().nullable();
const isoDate = z
  .string()
  .datetime({ offset: true })
  .optional()
  .nullable()
  .transform((v) => (v ? new Date(v) : null));

const leadSchema = z.strictObject({
  email: z.string().trim().max(320).email().optional().nullable(),
  phone: text(40),
  name: text(200),
  first_name: text(100),
  last_name: text(100),
  company: text(200),
  job_title: text(200),
  city: text(120),
  postal_code: text(20),
  country: text(80),
  origin: text(200),
  simulator: text(200),
  page_url: text(2048),
  referrer: text(2048),
  utm_source: text(200),
  utm_medium: text(200),
  utm_campaign: text(200),
  visitor_id: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional().nullable(),
  simulation_started_at: isoDate,
  simulation_completed_at: isoDate,
  payload: z.record(z.string(), z.unknown()).optional().nullable(),
});

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "inconnue";
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  // eslint-disable-next-line local/no-visible-text -- le schéma d'authentification HTTP, pas un texte
  const rawKey = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!rawKey) {
    return NextResponse.json({ error: "missing_api_key" }, { status: 401, headers: HEADERS });
  }
  if (!checkRateLimit(`leads:ip:${clientIp(request)}`, { limit: 120, windowMs: 60_000 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: HEADERS });
  }

  const auth = await authenticateApiKey(rawKey);
  if (!auth.ok) {
    if (auth.reason === "revoked") await recordRejection(auth.organizationId, "api_key_revoked", auth.keyPrefix);
    return NextResponse.json({ error: "invalid_api_key" }, { status: 401, headers: HEADERS });
  }
  if (!checkRateLimit(`leads:key:${auth.apiKeyId}`, { limit: 120, windowMs: 60_000 })) {
    await recordRejection(auth.organizationId, "rate_limited", auth.keyPrefix);
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: HEADERS });
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  const body = await request.text();
  if (declared > MAX_BODY_BYTES || Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
    await recordRejection(auth.organizationId, "payload_too_large", auth.keyPrefix);
    return NextResponse.json({ error: "payload_too_large", limit_bytes: MAX_BODY_BYTES }, { status: 413, headers: HEADERS });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(body);
  } catch {
    await recordRejection(auth.organizationId, "invalid_payload", auth.keyPrefix);
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: HEADERS });
  }
  const parsed = leadSchema.safeParse(parsedJson);
  if (!parsed.success) {
    await recordRejection(auth.organizationId, "invalid_payload", auth.keyPrefix);
    return NextResponse.json(
      { error: "invalid_payload", issues: parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400, headers: HEADERS }
    );
  }
  const lead = parsed.data;
  if (!lead.email && !lead.phone) {
    await recordRejection(auth.organizationId, "invalid_payload", auth.keyPrefix);
    // eslint-disable-next-line local/no-visible-text -- le contrat de l'API de collecte, lu par un développeur, stable
    return NextResponse.json({ error: "invalid_payload", issues: [{ path: "email", message: "email ou phone requis" }] }, { status: 400, headers: HEADERS });
  }
  if (lead.payload) {
    const keys = Object.keys(lead.payload).length;
    const bytes = Buffer.byteLength(JSON.stringify(lead.payload), "utf8");
    if (bytes > MAX_PAYLOAD_BYTES || keys > MAX_PAYLOAD_KEYS) {
      await recordRejection(auth.organizationId, "payload_too_large", auth.keyPrefix);
      return NextResponse.json(
        { error: "payload_too_large", limit_bytes: MAX_PAYLOAD_BYTES, limit_keys: MAX_PAYLOAD_KEYS },
        { status: 413, headers: HEADERS }
      );
    }
  }

  const received = await receiveLead(auth.organizationId, auth.apiKeyId, {
    email: lead.email ?? null,
    phone: lead.phone ?? null,
    name: lead.name ?? null,
    firstName: lead.first_name ?? null,
    lastName: lead.last_name ?? null,
    companyName: lead.company ?? null,
    jobTitle: lead.job_title ?? null,
    city: lead.city ?? null,
    postalCode: lead.postal_code ?? null,
    country: lead.country ?? null,
    origin: lead.origin ?? null,
    simulator: lead.simulator ?? null,
    pageUrl: lead.page_url ?? null,
    referrer: lead.referrer ?? null,
    utmSource: lead.utm_source ?? null,
    utmMedium: lead.utm_medium ?? null,
    utmCampaign: lead.utm_campaign ?? null,
    visitorId: lead.visitor_id ?? null,
    simulationStartedAt: lead.simulation_started_at,
    simulationCompletedAt: lead.simulation_completed_at,
    payload: lead.payload ?? null,
  });

  return NextResponse.json(
    {
      lead_id: received.leadId,
      contact_id: received.contactId,
      matched_existing_contact: received.matchedExistingContact,
      enriched_fields: received.enrichedFields,
    },
    { status: 201, headers: HEADERS }
  );
}
