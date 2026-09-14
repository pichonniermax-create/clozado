import { NextResponse } from "next/server";
import { DEMO_COOKIE, isRouterPrefetch } from "@/lib/demo/public";
import { safeInternalPath } from "@/lib/validation";

/**
 * GET /demo/quitter?vers=/inscription — la sortie de la démo publique : le
 * cookie de visite tombe, puis redirection vers un chemin RELATIF du
 * produit (jamais une adresse extérieure — un lien de sortie ne sert pas
 * de tremplin). Sans destination : l'accueil. Un préchargement du routeur
 * (`Next-Router-Prefetch: 1`) ne sort de rien : 204 sans toucher au cookie
 * — les liens de sortie sont déjà des `<a>` non préchargés, ceinture.
 *
 * La destination passe par `safeInternalPath` (chasse aux failles du
 * 2026-09-14) : l'ancien contrôle ne regardait que les deux premiers
 * caractères, et `/\t//evil.com` — la tabulation que les navigateurs
 * ignorent — devenait `//evil.com` une fois analysé.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (isRouterPrefetch(request.headers)) return new NextResponse(null, { status: 204, headers: { "x-robots-tag": "noindex" } });
  const url = new URL(request.url);
  const safe = safeInternalPath(url.searchParams.get("vers"), url.origin, "/");
  const response = NextResponse.redirect(new URL(safe, url.origin), 303);
  response.headers.set("x-robots-tag", "noindex");
  response.cookies.delete(DEMO_COOKIE);
  return response;
}
