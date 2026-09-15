import { NextResponse, type NextRequest } from "next/server";
import { handlers } from "@/auth";

/**
 * Les routes d'Auth.js — en LECTURE seulement pour ce qui agit (chasse aux
 * failles du 2026-09-14) : le lien magique se DEMANDE par l'action serveur
 * `signInAction` (limitée en débit, adresse validée, journalisée) et la
 * déconnexion par l'action `signOutAction` ; toutes deux appellent Auth.js
 * en mémoire, jamais par HTTP. Un `POST /api/auth/signin/resend` direct
 * contournait tout cela : n'importe qui pouvait faire partir des liens de
 * connexion à volonté (bombardement d'une adresse, épuisement du quota
 * Resend, journal inondé). Ces POST répondent 405 ; le clic sur le lien
 * reçu reste un GET (`/api/auth/callback/resend?token=…`), inchangé, comme
 * `/api/auth/csrf`, `/api/auth/session` et `/api/auth/providers`.
 */
const BLOCKED_POST = /^\/api\/auth\/(signin|callback|signout)(\/|$)/;

export const { GET } = handlers;

export async function POST(request: NextRequest) {
  if (BLOCKED_POST.test(request.nextUrl.pathname)) {
    return NextResponse.json({ error: "not_allowed" }, { status: 405, headers: { allow: "GET" } });
  }
  return handlers.POST(request);
}
