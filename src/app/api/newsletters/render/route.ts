import { NextResponse } from "next/server";
import { z } from "zod";
import { getRenderContext } from "@/db/queries/newsletters";
import { apiErrorResponse } from "@/lib/api-route";
import { AppError } from "@/lib/errors";
import { NEWSLETTER_DRAFT_SCHEMA } from "@/lib/newsletter/blocks";
import { renderNewsletterHtml } from "@/lib/newsletter/render-email";
import { checkRateLimit } from "@/lib/rate-limit";
import { requestOrigin } from "@/lib/request-origin";
import { requireApiUser, type SessionUser } from "@/lib/session";
import { getTranslations } from "next-intl/server";

const ROUTE = "api/newsletters/render";

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
 *
 * Soixante rendus par personne et par minute (audit, constat S5) : l'éditeur
 * en demande un par frappe (avec un délai) — bien en dessous ; un script en
 * rafale, non.
 */
export async function POST(request: Request) {
  const t = await getTranslations("newsletters.apiRender");
  let user: SessionUser;
  try {
    user = await requireApiUser();
    if (!checkRateLimit(`render:user:${user.id}`, { limit: 60, windowMs: 60_000 })) {
      throw new AppError("trop_de_demandes_reessaie_dans_un_moment", undefined, 429);
    }
  } catch (err) {
    return apiErrorResponse(err, { route: ROUTE });
  }

  const rawBody = await request.json().catch(() => null);
  const body = bodySchema.safeParse(rawBody);
  if (!body.success) {
    return NextResponse.json(
      { error: t("requete_invalide"), issues: body.error.issues },
      { status: 400 }
    );
  }

  let context;
  try {
    // Le logo en adresse absolue : ce HTML est celui de l'email, pas seulement de l'aperçu.
    context = await getRenderContext(user, body.data.targetId, await requestOrigin());
  } catch (err) {
    return apiErrorResponse(err, { route: ROUTE, organizationId: user.organizationId });
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
