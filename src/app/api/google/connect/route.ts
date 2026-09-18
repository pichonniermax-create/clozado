import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { clientIp } from "@/lib/client-ip";
import { isRouterPrefetch } from "@/lib/demo/public";
import { consentUrl, googleCredentials, googleRedirectUri, pkce } from "@/lib/google/oauth";
import { failureScreen, htmlResponse, SCREEN_HEADERS } from "@/lib/google/screen";
import { issueState, STATE_MAX_AGE_SECONDS, stateCookieName } from "@/lib/google/state";
import { checkRateLimit } from "@/lib/rate-limit";
import { requestOrigin } from "@/lib/request-origin";
import { getSession } from "@/lib/session";

/**
 * /api/google/connect — LE DÉPART DU RACCORDEMENT À L'AGENDA (chantier
 * réservation, étape 1). Ouverte à la main par l'exploitant, elle pose
 * l'état du consentement dans un cookie chiffré et renvoie chez Google.
 *
 * Trois choses à savoir :
 *
 * 1. **Super admin RÉEL.** On lit la session BRUTE, pas l'utilisateur
 *    effectif : `requireApiUser()` passe par la substitution, qui rend le
 *    rôle `admin` dès qu'une organisation est choisie dans le bandeau — la
 *    garde ne verrait jamais un super admin. Pour tout autre visiteur, la
 *    route répond 404 : elle ne s'annonce pas.
 * 2. **Une route GET qui AGIT** (elle pose un cookie) : elle refuse le
 *    préchargement du routeur, comme `/demo`. Elle ne se lie jamais par
 *    `<Link>`.
 * 3. **Aucune journalisation, jamais.** Ni ici, ni au retour : une adresse
 *    de rappel porte un code d'autorisation dans sa requête.
 */

export async function GET(request: Request): Promise<Response> {
  // Le préchargement ne doit rien déclencher : il ouvrirait un consentement à l'insu de la personne.
  if (isRouterPrefetch(request.headers)) return new NextResponse(null, { status: 204, headers: { "x-robots-tag": "noindex" } });

  const t = await getTranslations("google");
  try {
    const session = await getSession();
    // 404 et non 403 : une route d'exploitation ne dit pas qu'elle existe.
    if (session?.user?.role !== "super_admin") return new NextResponse(null, { status: 404, headers: { "x-robots-tag": "noindex" } });

    if (!checkRateLimit(`google-connect:${clientIp(request.headers)}`, { limit: 20, windowMs: 600_000 })) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "x-robots-tag": "noindex" } });
    }

    const credentials = googleCredentials();
    // Sans identifiants, la route refuse — jamais un point d'entrée ouvert qui ne mènerait nulle part.
    if (!credentials) return htmlResponse(failureScreen({ title: t("titre_refus"), message: t("identifiants_absents") }), 503);

    const origin = await requestOrigin();
    const redirectUri = googleRedirectUri(origin);
    const { verifier, challenge } = pkce();
    const state = issueState({ uid: session.user.id, redirectUri, verifier, now: Date.now() });

    const response = NextResponse.redirect(consentUrl({ credentials, redirectUri, state: state.state, challenge }), 303);
    for (const [key, value] of Object.entries(SCREEN_HEADERS)) if (key !== "content-type") response.headers.set(key, value);
    response.cookies.set(stateCookieName(origin), state.value, {
      httpOnly: true,
      // `Lax` et non `Strict` : le retour de Google est une navigation venue d'un autre site.
      sameSite: "lax",
      secure: origin.startsWith("https://"),
      path: "/",
      maxAge: STATE_MAX_AGE_SECONDS,
    });
    return response;
  } catch {
    // Rien ne remonte : une exception non rattrapée ferait journaliser l'adresse par l'instrumentation.
    return htmlResponse(failureScreen({ title: t("titre_refus"), message: t("echec_generique") }), 500);
  }
}

/** Un scanner, un aperçu de lien, un préchargement : rien ne déclenche un consentement. */
export function HEAD(): Response {
  return NextResponse.json({ error: "not_allowed" }, { status: 405, headers: { allow: "GET" } });
}
export function POST(): Response {
  return NextResponse.json({ error: "not_allowed" }, { status: 405, headers: { allow: "GET" } });
}
