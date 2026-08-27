import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { getRenderContext } from "@/db/queries/newsletters";
import { NEWSLETTER_DRAFT_SCHEMA } from "@/lib/newsletter/blocks";
import { renderNewsletterHtml } from "@/lib/newsletter/render-email";
import { requestOrigin } from "@/lib/request-origin";
import type { OrgScopeUser } from "@/lib/session";
import { getTranslations } from "next-intl/server";
import { errorMessage } from "@/lib/form-actions";
import { isAppError } from "@/lib/errors";

const bodySchema = z.object({
  targetId: z.uuid(),
  subject: NEWSLETTER_DRAFT_SCHEMA.shape.subject,
  preheader: NEWSLETTER_DRAFT_SCHEMA.shape.preheader,
  blocks: NEWSLETTER_DRAFT_SCHEMA.shape.blocks,
  /** L'éditeur demande les ancres de clic ; un aperçu d'envoi ne les veut pas. */
  editable: z.boolean().optional(),
});

/**
 * POST /api/newsletters/render — rend un draft (non persisté) en HTML
 * email-safe, pour l'aperçu live de l'éditeur.
 *
 * Niveau BROUILLON (`NEWSLETTER_DRAFT_SCHEMA`) et non « newsletter aboutie » :
 * l'éditeur doit pouvoir afficher un email encore vierge — structure et
 * marque de l'organisation, sans objet ni bloc — puis le rendre à nouveau à
 * chaque frappe, y compris quand un bloc vient d'être inséré et n'a rien
 * dedans. Les deux niveaux sortent de la même définition de forme (voir
 * `buildBlockSchemas`), ils ne peuvent pas diverger.
 */
export async function POST(request: Request) {
  const t = await getTranslations("newsletters.apiRender");
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: t("authentification_requise") }, { status: 401 });
  }

  const rawBody = await request.json().catch(() => null);
  const body = bodySchema.safeParse(rawBody);
  if (!body.success) {
    return NextResponse.json(
      { error: t("requete_invalide"), issues: body.error.issues },
      { status: 400 }
    );
  }

  const user: OrgScopeUser = {
    role: session.user.role,
    organizationId: session.user.organizationId,
  };

  let context;
  try {
    // Le logo en adresse absolue : ce HTML est celui de l'email, pas seulement de l'aperçu.
    context = await getRenderContext(user, body.data.targetId, await requestOrigin());
  } catch (err) {
    const message = await errorMessage(err);
    const status = isAppError(err) ? err.status : 400;
    return NextResponse.json({ error: message }, { status });
  }

  const html = renderNewsletterHtml({
    brand: context.brand,
    subject: body.data.subject,
    preheader: body.data.preheader,
    blocks: body.data.blocks,
    signatory: context.signatory,
    lang: context.locale,
    editable: body.data.editable ?? false,
  });

  return NextResponse.json({ html });
}
