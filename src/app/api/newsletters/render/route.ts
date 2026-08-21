import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { getRenderContext } from "@/db/queries/newsletters";
import { NEWSLETTER_OUTPUT_SCHEMA } from "@/lib/newsletter/blocks";
import { renderNewsletterHtml } from "@/lib/newsletter/render-email";
import type { OrgScopeUser } from "@/lib/session";

const bodySchema = z.object({
  targetId: z.uuid(),
  subject: NEWSLETTER_OUTPUT_SCHEMA.shape.subject,
  preheader: NEWSLETTER_OUTPUT_SCHEMA.shape.preheader,
  blocks: NEWSLETTER_OUTPUT_SCHEMA.shape.blocks,
});

/**
 * POST /api/newsletters/render — rend un draft (non persisté) en HTML
 * email-safe, pour l'aperçu live du composer. Même schéma de blocs que la
 * génération et la sauvegarde (`NEWSLETTER_OUTPUT_SCHEMA`) — jamais une
 * validation dupliquée qui pourrait diverger.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => null);
  const body = bodySchema.safeParse(rawBody);
  if (!body.success) {
    return NextResponse.json(
      { error: "Requête invalide.", issues: body.error.issues },
      { status: 400 }
    );
  }

  const user: OrgScopeUser = {
    role: session.user.role,
    organizationId: session.user.organizationId,
  };

  let context;
  try {
    context = await getRenderContext(user, body.data.targetId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue.";
    const status = message.startsWith("Accès refusé")
      ? 403
      : message.includes("introuvable")
        ? 404
        : 400;
    return NextResponse.json({ error: message }, { status });
  }

  const html = renderNewsletterHtml({
    brand: context.brand,
    subject: body.data.subject,
    preheader: body.data.preheader,
    blocks: body.data.blocks,
    signatory: context.signatory,
  });

  return NextResponse.json({ html });
}
