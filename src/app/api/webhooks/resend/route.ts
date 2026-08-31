import { after } from "next/server";
import { NextResponse } from "next/server";
import { ingestReceivedEmail } from "@/lib/email/inbound/ingest";
import { handleResendEvent, receivedNoticeOf, RECEIVED_EVENT, verifySvixSignature, type ResendWebhookEvent } from "@/lib/email/webhooks";

/**
 * POST /api/webhooks/resend — les événements du fournisseur : ceux des
 * emails ENVOYÉS (remis, ouvert, cliqué, rejeté, plainte, échec) et, depuis
 * l'étape 3, ceux des emails REÇUS sur l'adresse d'ingestion
 * (`email.received`). Corps lu BRUT (la signature porte sur les octets
 * exacts), signature Svix vérifiée avec `RESEND_WEBHOOK_SECRET` — sans la
 * variable, la route refuse tout : jamais un webhook ouvert. Un message
 * encore inconnu (le webhook arrive avant l'écriture de l'id du
 * fournisseur) répond 404 pour que le fournisseur réessaie ; un rejeu est
 * ignoré par l'unicité de `svix-id`.
 *
 * La RÉCEPTION répond tout de suite et travaille dans `after()` : relire le
 * message chez le fournisseur, télécharger le brut, vérifier DKIM/SPF par
 * le DNS prend des secondes — le fournisseur, lui, attend une réponse
 * courte, et un rejeu retomberait sur l'unicité de l'identifiant.
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

  if (event.type === RECEIVED_EVENT) {
    const notice = receivedNoticeOf(event);
    if (!notice) return NextResponse.json({ outcome: "ignored" });
    after(async () => {
      try {
        await ingestReceivedEmail(notice);
      } catch (error) {
        // L'ingestion ne doit jamais faire échouer la réponse au
        // fournisseur : ce qui casse est tracé, et l'email reste chez lui.
        console.error("ingestion:", error);
      }
    });
    return NextResponse.json({ outcome: "accepted" });
  }

  const outcome = await handleResendEvent(event, request.headers.get("svix-id") ?? "");
  if (outcome === "unknown_message") return NextResponse.json({ outcome }, { status: 404 });
  return NextResponse.json({ outcome });
}
