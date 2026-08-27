import { NextResponse } from "next/server";
import { handleResendEvent, verifySvixSignature, type ResendWebhookEvent } from "@/lib/email/webhooks";

/**
 * POST /api/webhooks/resend — les événements du fournisseur d'envoi
 * (remis, ouvert, cliqué, rejeté, plainte, échec). Corps lu BRUT (la
 * signature porte sur les octets exacts), signature Svix vérifiée avec
 * `RESEND_WEBHOOK_SECRET` — sans la variable, la route refuse tout :
 * jamais un webhook ouvert. Un message encore inconnu (le webhook arrive
 * avant l'écriture de l'id du fournisseur) répond 404 pour que le
 * fournisseur réessaie ; un rejeu est ignoré par l'unicité de `svix-id`.
 */
export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook_not_configured" }, { status: 503 });
  const body = await request.text();
  const ok = verifySvixSignature(
    { id: request.headers.get("svix-id"), timestamp: request.headers.get("svix-timestamp"), signature: request.headers.get("svix-signature") },
    body,
    secret
  );
  if (!ok) return NextResponse.json({ error: "invalid_signature" }, { status: 401 });

  let event: ResendWebhookEvent;
  try {
    event = JSON.parse(body) as ResendWebhookEvent;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const outcome = await handleResendEvent(event, request.headers.get("svix-id") ?? "");
  if (outcome === "unknown_message") return NextResponse.json({ outcome }, { status: 404 });
  return NextResponse.json({ outcome });
}
