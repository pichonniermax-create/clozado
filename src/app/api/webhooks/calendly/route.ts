import { NextResponse } from "next/server";
import { findActiveConnectionByHostEmail } from "@/db/queries/calendar-connections";
import { CALENDLY_EVENT_SCHEMA, hostEmailsOf, ingestCalendlyEvent } from "@/lib/calendly/ingest";
import { verifyCalendlySignature } from "@/lib/calendly/signature";
import { decryptSecret } from "@/lib/crypto";

/**
 * POST /api/webhooks/calendly — même discipline que le webhook Resend :
 * corps BRUT (la signature porte sur les octets exacts), et le contenu
 * n'est qu'un INDICE tant que le HMAC n'a pas validé le message entier.
 * La clé de signature est PAR PERSONNE (`calendar_connections`) : la
 * charge sert à trouver la connexion candidate (email d'hôte → `users`),
 * la signature tranche. Une connexion déconnectée n'est plus candidate —
 * l'événement est refusé, rien n'est écrit.
 */
export async function POST(request: Request) {
  const body = await request.text();

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
    if (verifyCalendlySignature(request.headers.get("calendly-webhook-signature"), body, signingKey)) {
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
