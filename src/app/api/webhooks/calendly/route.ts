import { NextResponse } from "next/server";
import { findActiveConnectionByHostEmail } from "@/db/queries/calendar-connections";
import { CALENDLY_EVENT_SCHEMA, hostEmailsOf, ingestCalendlyEvent } from "@/lib/calendly/ingest";
import { verifyCalendlySignature } from "@/lib/calendly/signature";
import { clientIp } from "@/lib/client-ip";
import { decryptSecret } from "@/lib/crypto";
import { checkRateLimit } from "@/lib/rate-limit";

/** Dix secondes suffisent à une notification ; au-delà, c'est une charge, pas un rendez-vous. */
export const maxDuration = 10;

/** La forme de l'en-tête de signature (`t=<horodatage>,v1=<hex>`) — vérifiée AVANT de lire le corps. */
const SIGNATURE_SHAPE = /(^|,)\s*t=\d+\s*(,|$)/;
const SIGNATURE_V1 = /(^|,)\s*v1=[0-9a-f]{64}\s*(,|$)/i;
/** Un événement Calendly pèse quelques Ko ; soixante-quatre en est une charge. */
const MAX_BODY_BYTES = 65_536;

/**
 * POST /api/webhooks/calendly — même discipline que le webhook Resend :
 * corps BRUT (la signature porte sur les octets exacts), et le contenu
 * n'est qu'un INDICE tant que le HMAC n'a pas validé le message entier.
 * La clé de signature est PAR PERSONNE (`calendar_connections`) : la
 * charge sert à trouver la connexion candidate (email d'hôte → `users`),
 * la signature tranche. Une connexion déconnectée n'est plus candidate —
 * l'événement est refusé, rien n'est écrit.
 *
 * Avant toute lecture (chasse aux failles du 2026-09-14) : un débit par
 * adresse, un en-tête de signature de la bonne forme, une taille bornée —
 * une requête anonyme ne déclenche plus une requête SQL par élément d'un
 * tableau non borné.
 */
export async function POST(request: Request) {
  if (!checkRateLimit(`calendly:ip:${clientIp(request.headers)}`, { limit: 60, windowMs: 60_000 })) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const signature = request.headers.get("calendly-webhook-signature");
  if (!signature || !SIGNATURE_SHAPE.test(signature) || !SIGNATURE_V1.test(signature)) {
    return NextResponse.json({ error: "unknown_host_or_invalid_signature" }, { status: 401 });
  }
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const event = CALENDLY_EVENT_SCHEMA.safeParse(parsed);
  if (!event.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  let verified: { organizationId: string; userId: string } | null = null;
  for (const email of hostEmailsOf(event.data)) {
    const connection = await findActiveConnectionByHostEmail(email);
    if (!connection) continue;
    const signingKey = decryptSecret(connection.signingKeyEncrypted, "calendly-signing-key");
    if (!signingKey) continue;
    if (verifyCalendlySignature(signature, body, signingKey)) {
      verified = connection;
      break;
    }
  }
  if (!verified) {
    // Hôte inconnu, connexion déconnectée ou signature fausse : rien n'est écrit.
    return NextResponse.json({ error: "unknown_host_or_invalid_signature" }, { status: 401 });
  }

  const outcome = await ingestCalendlyEvent(verified, event.data);
  return NextResponse.json({ outcome });
}
