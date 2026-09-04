import { NextResponse } from "next/server";
import { DEMO_COOKIE, DEMO_SESSION_MAX_AGE, DEMO_TOUR_PARAM } from "@/lib/demo/public";
import { getDemoPersona, getPublicDemoOrganization, issueDemoToken } from "@/lib/demo/session";

/**
 * GET /demo — l'entrée de la démo publique (docs/module-demo.md §1.4). Tant
 * que l'interrupteur est éteint, la route n'existe pas (404). Sinon : le
 * cookie de visite est posé et le visiteur arrive sur le tableau de bord
 * de l'organisation de démo, visite guidée lancée. Rien n'est écrit en
 * base ; rien n'est indexé.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
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
