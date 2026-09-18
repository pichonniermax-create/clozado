import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { clientIp } from "@/lib/client-ip";
import { exchangeCode, googleCredentials, googleRedirectUri, revokeToken, scopesCover, SCOPES } from "@/lib/google/oauth";
import { failureScreen, htmlResponse, tokenScreen } from "@/lib/google/screen";
import { consumeState, stateCookieName } from "@/lib/google/state";
import { checkRateLimit } from "@/lib/rate-limit";
import { requestOrigin } from "@/lib/request-origin";
import { getSession } from "@/lib/session";

/**
 * /api/google/callback — LE RETOUR DE GOOGLE (chantier réservation,
 * étape 1). Il échange le code contre les jetons et AFFICHE le jeton de
 * rafraîchissement une seule fois, pour qu'il soit recopié dans
 * `GOOGLE_REFRESH_TOKEN`.
 *
 * Le jeton ne touche RIEN : ni base, ni fichier, ni journal, ni URL. Il ne
 * vit que dans le corps de cette réponse. L'écran le dit : fermer sans
 * copier, c'est devoir relancer le consentement (et révoquer l'ancien —
 * `docs/rendez-vous-google.md`).
 *
 * L'ordre est celui de la prudence : refuser qui n'a rien à faire là,
 * consommer l'état AVANT tout appel réseau (le cookie part dans tous les
 * cas — une tentative, un code), vérifier que le consentement n'a pas été
 * amputé d'une portée, et seulement alors montrer le jeton.
 *
 * Tout le corps est sous `try` : une exception qui remonterait ferait
 * journaliser l'adresse — et l'adresse porte le code d'autorisation.
 */

export async function GET(request: Request): Promise<Response> {
  const t = await getTranslations("google");
  const origin = await requestOrigin();
  const cookieName = stateCookieName(origin);

  const refuse = (message: string, status: number, detail?: string): Response => {
    const response = htmlResponse(failureScreen({ title: t("titre_refus"), message, detail }), status);
    // Une tentative, un état : le cookie s'efface même quand ça échoue (et surtout quand ça échoue).
    response.headers.append("set-cookie", `${cookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${origin.startsWith("https://") ? "; Secure" : ""}`);
    return response;
  };

  try {
    const session = await getSession();
    if (session?.user?.role !== "super_admin") return new NextResponse(null, { status: 404, headers: { "x-robots-tag": "noindex" } });
    if (!checkRateLimit(`google-callback:${clientIp(request.headers)}`, { limit: 20, windowMs: 600_000 })) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "x-robots-tag": "noindex" } });
    }

    const store = await cookies();
    const cookieValue = store.get(cookieName)?.value;
    const url = new URL(request.url);
    const state = consumeState(cookieValue, {
      state: url.searchParams.get("state"),
      uid: session.user.id,
      redirectUri: googleRedirectUri(origin),
      now: Date.now(),
    });
    if (!state.ok) return refuse(t("etat_invalide"), 400, state.reason);

    // Le consentement a pu être refusé : Google le dit dans l'adresse, on ne va pas plus loin.
    if (url.searchParams.get("error")) return refuse(t("consentement_refuse"), 400);
    const code = url.searchParams.get("code");
    if (!code) return refuse(t("code_absent"), 400);

    const credentials = googleCredentials();
    if (!credentials) return refuse(t("identifiants_absents"), 503);

    const exchange = await exchangeCode({ code, verifier: state.verifier, redirectUri: state.redirectUri, credentials });
    // Le corps d'erreur de Google peut contenir un jeton : seul le STATUT sort d'ici.
    if (!exchange.ok) return refuse(t("echange_refuse"), 400, String(exchange.status));
    if (!exchange.refreshToken) return refuse(t("aucun_jeton"), 400);
    if (!scopesCover(exchange.scope)) {
      // Un consentement amputé d'une portée échouerait plus tard, loin d'ici : on rend le jeton inutilisable tout de suite.
      await revokeToken(exchange.refreshToken);
      return refuse(t("portees_incompletes"), 400);
    }

    const response = htmlResponse(
      tokenScreen({
        title: t("titre_jeton"),
        warning: t("avertissement_une_fois"),
        variableIntro: t("a_coller_dans"),
        variableName: "GOOGLE_REFRESH_TOKEN",
        scopesLabel: t("portees_accordees"),
        scopes: SCOPES.join(" "),
        refreshToken: exchange.refreshToken,
      }),
      200
    );
    response.headers.append("set-cookie", `${cookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${origin.startsWith("https://") ? "; Secure" : ""}`);
    return response;
  } catch {
    return refuse(t("echec_generique"), 500);
  }
}

export function HEAD(): Response {
  return NextResponse.json({ error: "not_allowed" }, { status: 405, headers: { allow: "GET" } });
}
export function POST(): Response {
  return NextResponse.json({ error: "not_allowed" }, { status: 405, headers: { allow: "GET" } });
}
