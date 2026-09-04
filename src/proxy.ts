import { NextResponse, type NextRequest } from "next/server";
import { DEMO_COOKIE, DEMO_FORBIDDEN_PATHS, DEMO_READ_ONLY_PARAM, DEMO_READ_ONLY_VALUE, isNavigation } from "@/lib/demo/public";

/**
 * LA LECTURE SEULE de la démo publique, imposée avant tout rendu
 * (docs/module-demo.md §1.4, première couche). Le proxy ne fait rien tant
 * que le cookie de visite est absent : le produit ordinaire ne passe pas
 * par lui. Quand il est présent :
 * - toute action serveur (en-tête `Next-Action`) reçoit une réponse
 *   « redirige vers la page courante avec ?demo=lecture-seule » — le
 *   client Next fait une navigation complète et la coquille dit pourquoi ;
 * - tout autre POST/PUT/PATCH/DELETE : 303 vers la même adresse (un
 *   formulaire sans JavaScript), 403 pour une route API ;
 * - les chemins sensibles (réglages, profil, import, API) sont refusés
 *   même en lecture : 303 vers le tableau de bord ;
 * - entrer dans la connexion ou l'inscription TERMINE la visite : le cookie
 *   tombe, la suite est ordinaire — « entrer » = une vraie navigation
 *   (`Sec-Fetch-Mode: navigate`, ou pas de Fetch Metadata). Un
 *   préchargement ou une transition du routeur client n'est pas une entrée
 *   — et le proxy ne voit de toute façon pas `Next-Router-Prefetch` : Next
 *   retire les en-têtes « flight » avant le middleware.
 * Une requête forgée passe par le même chemin : cacher un bouton n'a
 * jamais été la protection.
 */
const EXIT_PATHS = ["/login", "/inscription"];

export function proxy(request: NextRequest) {
  if (!request.cookies.has(DEMO_COOKIE)) return NextResponse.next();
  const { pathname } = request.nextUrl;
  const reading = request.method === "GET" || request.method === "HEAD";
  if (pathname === "/demo" || pathname.startsWith("/demo/")) return NextResponse.next();
  if (reading && EXIT_PATHS.includes(pathname) && isNavigation(request.headers)) {
    const response = NextResponse.next();
    response.cookies.delete(DEMO_COOKIE);
    return response;
  }
  const readOnlyUrl = (target: string) => {
    const url = new URL(target, request.url);
    url.searchParams.set(DEMO_READ_ONLY_PARAM, DEMO_READ_ONLY_VALUE);
    return url;
  };
  const isApi = pathname === "/api" || pathname.startsWith("/api/");
  if (request.headers.has("next-action")) {
    const url = readOnlyUrl(pathname);
    return new NextResponse(null, {
      status: 200,
      headers: { "x-action-redirect": `${url.pathname}${url.search};replace`, "content-type": "text/plain" },
    });
  }
  if (!reading) {
    if (isApi) return NextResponse.json({ error: "demo_read_only" }, { status: 403 });
    return NextResponse.redirect(readOnlyUrl(pathname), 303);
  }
  if (DEMO_FORBIDDEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    if (isApi) return NextResponse.json({ error: "demo_read_only" }, { status: 403 });
    return NextResponse.redirect(readOnlyUrl("/dashboard"), 303);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|s\\.js).*)"],
};
