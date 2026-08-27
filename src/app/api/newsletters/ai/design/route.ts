import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { getDesignContext } from "@/db/queries/newsletters";
import { listSourcesForComposer } from "@/db/queries/watch";
import { AINotConfiguredError, AITruncatedError, getAIProvider } from "@/lib/ai";
import type { SourceProfile } from "@/lib/ai/types";
import { normalizeSourcesBlocks, reviewNewsletter, type ReviewIssue } from "@/lib/newsletter/review";
import { parsePartialNewsletter } from "@/lib/newsletter/stream-parse";
import type { OrgScopeUser } from "@/lib/session";
import { getTranslations } from "next-intl/server";
import { errorMessage } from "@/lib/form-actions";
import { isAppError } from "@/lib/errors";
import { settingsOfOrganization } from "@/i18n/locale-lookup";
import { createFormats } from "@/lib/format";

const bodySchema = z.object({
  targetId: z.uuid(),
  brief: z.string().min(1),
  lang: z.enum(["fr", "en"]).default("fr"),
  /** La matière : les articles rattachés à l'email (panier, écart) — lus en base, scopés à l'organisation de la cible ; c'est la liste blanche des sources. */
  sourceItemIds: z.array(z.uuid()).max(50).optional(),
});

/**
 * POST /api/newsletters/ai/design — génère une newsletter complète (objet,
 * préheader, blocs, sujets) pour une cible de l'organisation de l'appelant,
 * depuis l'identité de la cible et la MATIÈRE rattachée, puis l'exécute
 * immédiatement à travers la revue déterministe (`reviewNewsletter`) : le
 * client reçoit toujours les deux, jamais un contenu jugé silencieusement
 * conforme sans passer par le filet de sécurité (dossier de reconstruction
 * §8 point 6). Avant la revue, les blocs `sources` sont NORMALISÉS
 * (`normalizeSourcesBlocks`) : seuls les articles de la matière y restent,
 * avec leurs champs recopiés depuis la base — jamais un lien du modèle.
 *
 * La réponse est un FLUX : les blocs apparaissent dans le document au fur et
 * à mesure de leur rédaction, plutôt qu'un écran figé pendant vingt secondes.
 * Ce qui transite en cours de route est explicitement provisoire — voir le
 * détail du protocole plus bas.
 */
export async function POST(request: Request) {
  const t = await getTranslations("newsletters.apiAiDesign");
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
  let sources: SourceProfile[];
  try {
    context = await getDesignContext(user, body.data.targetId);
    // La matière, dans la langue et les formats des contenus de
    // l'organisation (la date telle qu'elle s'affichera dans l'email).
    const fmt = createFormats(await settingsOfOrganization(context.organizationId));
    const items = body.data.sourceItemIds?.length ? await listSourcesForComposer(context.organizationId, body.data.sourceItemIds) : [];
    sources = items.map((item) => ({
      id: item.id,
      title: item.title,
      publisher: item.publisher,
      date: item.publishedAt ? fmt.date(item.publishedAt) : "",
      url: item.url,
      summary: item.summary,
    }));
  } catch (err) {
    const message = await errorMessage(err);
    const status = isAppError(err) ? err.status : 400;
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

  const designInput = {
    organization: context.organization,
    target: context.target,
    signatory: context.signatory,
    verifiedFigures: context.verifiedFigures,
    sources,
    recentTopics: context.recentTopics,
    lang: body.data.lang,
    brief: body.data.brief,
  };
  // Les chiffres autorisés : leurs valeurs et leurs libellés (« sur 20 ans » se cite avec le taux).
  const allowedFigures = context.verifiedFigures.flatMap((f) => [f.value, f.label]);

  /**
   * Réponse en flux de lignes JSON (une par ligne).
   *
   * - `{ type: "progress", newsletter }` — état provisoire : objet, préheader
   *   et blocs COMPLETS reçus jusqu'ici. Sert à faire apparaître le contenu
   *   au fil de l'eau ; rien n'y est encore vérifié.
   * - `{ type: "done", newsletter, review }` — la sortie complète, validée
   *   contre le schéma, normalisée (sources) puis passée à la revue
   *   déterministe. C'est la seule qui fasse foi, et elle remplace
   *   intégralement le provisoire.
   * - `{ type: "error", error }` — une panne survenue APRÈS le début du flux,
   *   qu'un code HTTP ne peut plus porter (l'en-tête est déjà parti).
   *
   * Le format en lignes plutôt que du SSE : il n'y a qu'un producteur, pas
   * de reconnexion à gérer, et une ligne = un objet se lit sans dépendance.
   */
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(JSON.stringify(payload) + "\n"));
      };

      try {
        // Le JSON d'outil arrive par centaines de fragments, mais l'écran ne
        // change que lorsqu'un bloc de PLUS est complet (ou que l'objet /
        // l'aperçu apparaît). On n'émet que là : sans ce filtre, chaque
        // fragment expédiait une copie du document entier — des centaines de
        // messages pour une douzaine de changements visibles.
        let derniere = "";
        const generated = await provider.designNewsletterStreaming(
          designInput,
          (accumulated) => {
            const partiel = parsePartialNewsletter(accumulated);
            const signature = `${partiel.subject ?? ""}|${partiel.preheader ?? ""}|${partiel.blocks.length}`;
            if (signature === derniere) return;
            derniere = signature;
            send({ type: "progress", newsletter: partiel });
          }
        );

        // La liste blanche d'abord, la revue ensuite — sur la sortie
        // complète et normalisée : le streaming n'a rien relâché sur ce
        // filet de sécurité.
        const { output: newsletter, dropped } = normalizeSourcesBlocks(generated, sources);
        const review = reviewNewsletter(newsletter, { allowedFigures, sources });
        const issues: ReviewIssue[] = dropped > 0 ? [{ code: "unknown_source", count: dropped }, ...review.issues] : review.issues;
        send({ type: "done", newsletter, review: { issues } });
      } catch (err) {
        const message =
          err instanceof AITruncatedError
            ? err.message
            : err instanceof Error
              ? err.message
              : t("erreur_de_generation_ia");
        send({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // Empêche la mise en tampon par un proxy, qui annulerait tout l'intérêt.
      "X-Accel-Buffering": "no",
    },
  });
}
