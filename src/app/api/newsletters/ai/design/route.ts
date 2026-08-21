import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { getDesignContext } from "@/db/queries/newsletters";
import { AINotConfiguredError, AITruncatedError, getAIProvider } from "@/lib/ai";
import { reviewNewsletter } from "@/lib/newsletter/review";
import type { OrgScopeUser } from "@/lib/session";

const bodySchema = z.object({
  targetId: z.uuid(),
  brief: z.string().min(1),
  lang: z.enum(["fr", "en"]).default("fr"),
});

/**
 * POST /api/newsletters/ai/design — génère une newsletter complète (objet,
 * préheader, blocs) pour une cible de l'organisation de l'appelant, puis
 * l'exécute immédiatement à travers la revue déterministe (`reviewNewsletter`)
 * : le client reçoit toujours les deux, jamais un contenu jugé silencieusement
 * conforme sans passer par le filet de sécurité (dossier de reconstruction
 * §8 point 6).
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
    context = await getDesignContext(user, body.data.targetId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue.";
    const status = message.startsWith("Accès refusé")
      ? 403
      : message.includes("introuvable")
        ? 404
        : 400;
    return NextResponse.json({ error: message }, { status });
  }

  let provider;
  try {
    provider = getAIProvider();
  } catch (err) {
    if (err instanceof AINotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }

  try {
    const newsletter = await provider.designNewsletter({
      organization: context.organization,
      target: context.target,
      signatory: context.signatory,
      verifiedFigures: context.verifiedFigures,
      lang: body.data.lang,
      brief: body.data.brief,
    });

    const review = reviewNewsletter(
      newsletter,
      context.verifiedFigures.map((f) => f.value)
    );

    return NextResponse.json({ newsletter, review });
  } catch (err) {
    if (err instanceof AITruncatedError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    const message = err instanceof Error ? err.message : "Erreur de génération IA.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
