import { NextResponse, type NextRequest } from "next/server";
import { callbackUrl, isTokenShape, safeCallbackPath } from "@/lib/auth/magic-link";
import { isPlausibleEmail } from "@/lib/email/address";

/**
 * LE GESTE EXPLICITE (correctif du 2026-09-17) : le bouton « Me connecter »
 * de la page de confirmation poste ici, et la réponse est une redirection
 * (303) vers le callback d'Auth.js — le seul endroit qui consomme le jeton
 * et ouvre la session. Cette route ne lit ni n'écrit rien en base : elle
 * reconstruit l'adresse du callback avec les paramètres du lien, sur la
 * même origine, et ne laisse passer qu'un chemin de retour interne.
 * Un GET ici ne fait rien (405) : un scanner n'y déclenche aucune action.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const back = safeCallbackPath(String(form.get("callbackUrl") ?? ""));
  if (!isTokenShape(token) || !isPlausibleEmail(email)) {
    return NextResponse.redirect(new URL("/login/erreur?error=Verification", request.nextUrl.origin), 303);
  }
  return NextResponse.redirect(callbackUrl({ origin: request.nextUrl.origin, token, email, callbackUrl: back }), 303);
}

export function GET() {
  return NextResponse.json({ error: "not_allowed" }, { status: 405, headers: { allow: "POST" } });
}
