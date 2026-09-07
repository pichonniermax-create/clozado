import { NextResponse } from "next/server";
import { DEMO_COOKIE, DEMO_SESSION_MAX_AGE, DEMO_TOUR_PARAM, isRouterPrefetch } from "@/lib/demo/public";
import { getDemoPersona, getPublicDemoOrganization, issueDemoToken } from "@/lib/demo/session";

/**
 * GET /demo — l'entrée de la démo publique (docs/module-demo.md §1.4). Tant
 * que l'interrupteur est éteint, la route n'existe pas (404). Sinon : le
 * cookie de visite est posé et le visiteur arrive sur le tableau de bord
 * de l'organisation de démo, visite guidée lancée. Rien n'est écrit en
 * base ; rien n'est indexé.
 *
 * Un préchargement du routeur (`Next-Router-Prefetch: 1`) n'entre nulle
 * part : 204 sans cookie — constaté depuis la production le 2026-09-07 :
 * le lien « Visiter la démo » de la carte Démo, un `Link`, était préchargé
 * dès l'affichage de l'espace gestionnaire, et le super admin se retrouvait
 * visiteur en lecture seule de sa propre production (le cookie de visite
 * prime sur la session, §1.4). Même piège, même parade que `/demo/quitter` :
 * une route `GET` qui AGIT ne se lie jamais par `Link`, et refuse un
 * préchargement — ceinture et bretelles.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (isRouterPrefetch(request.headers)) return new NextResponse(null, { status: 204, headers: { "x-robots-tag": "noindex" } });
  const org = await getPublicDemoOrganization();
  const persona = org ? await getDemoPersona(org.id) : null;
  if (!org || !persona) {
    return new NextResponse(null, { status: 404, headers: { "x-robots-tag": "noindex" } });
  }
  const token = await issueDemoToken({ org: org.id, uid: persona.id, demo: true });
  const target = new URL(`/dashboard?${DEMO_TOUR_PARAM}=1`, request.url);
  const response = NextResponse.redirect(target, 303);
  response.headers.set("x-robots-tag", "noindex");
  response.cookies.set(DEMO_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: target.protocol === "https:",
    path: "/",
    maxAge: DEMO_SESSION_MAX_AGE,
  });
  return response;
}
