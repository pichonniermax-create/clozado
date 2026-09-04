import { NextResponse } from "next/server";
import { DEMO_COOKIE, isRouterPrefetch } from "@/lib/demo/public";

/**
 * GET /demo/quitter?vers=/inscription — la sortie de la démo publique : le
 * cookie de visite tombe, puis redirection vers un chemin RELATIF du
 * produit (jamais une adresse extérieure — un lien de sortie ne sert pas
 * de tremplin). Sans destination : l'accueil. Un préchargement du routeur
 * (`Next-Router-Prefetch: 1`) ne sort de rien : 204 sans toucher au cookie
 * — les liens de sortie sont déjà des `<a>` non préchargés, ceinture.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (isRouterPrefetch(request.headers)) return new NextResponse(null, { status: 204, headers: { "x-robots-tag": "noindex" } });
  const url = new URL(request.url);
  const wanted = url.searchParams.get("vers") ?? "/";
  const safe = wanted.startsWith("/") && !wanted.startsWith("//") ? wanted : "/";
  const response = NextResponse.redirect(new URL(safe, request.url), 303);
  response.headers.set("x-robots-tag", "noindex");
  response.cookies.delete(DEMO_COOKIE);
  return response;
}
