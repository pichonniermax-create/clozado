import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { consumeLoginCode, issueVerificationToken } from "@/db/queries/login-codes";
import { callbackUrl, normalizeLoginCode } from "@/lib/auth/magic-link";
import { clientIp } from "@/lib/client-ip";
import { isPlausibleEmail } from "@/lib/email/address";
import { log } from "@/lib/log";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * LE CODE À SIX CHIFFRES (correctif du 2026-09-17) : la page de connexion
 * poste ici l'adresse et le code reçu dans l'email. Un code juste vaut le
 * lien : un jeton d'Auth.js neuf est émis pour l'adresse et le navigateur
 * est envoyé au callback (303), qui ouvre la session — les mêmes gardes
 * s'appliquent (adresse connue, pas d'auto-inscription). Un code faux
 * compte un essai ; au cinquième, le code meurt. Limité en débit par IP et
 * par adresse, et les réponses ne disent jamais si l'adresse a un compte.
 */
const back = (request: NextRequest, outcome: string, email: string) => {
  const url = new URL("/login", request.nextUrl.origin);
  url.searchParams.set("code", outcome);
  if (email) url.searchParams.set("email", email);
  url.hash = "code";
  return NextResponse.redirect(url, 303);
};

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const code = normalizeLoginCode(String(form.get("code") ?? ""));
  if (!isPlausibleEmail(email) || !code) return back(request, "invalid", isPlausibleEmail(email) ? email : "");
  if (!checkRateLimit(`login-code:ip:${clientIp(request.headers)}`, { limit: 10, windowMs: 60_000 })) return back(request, "locked", email);
  if (!checkRateLimit(`login-code:email:${createHash("sha256").update(email).digest("hex").slice(0, 32)}`, { limit: 10, windowMs: 600_000 })) return back(request, "locked", email);
  const outcome = await consumeLoginCode(email, code);
  if (outcome !== "ok") {
    log.info("login_code_refused", { outcome });
    return back(request, outcome === "locked" ? "locked" : "invalid", email);
  }
  const token = await issueVerificationToken(email);
  return NextResponse.redirect(callbackUrl({ origin: request.nextUrl.origin, token, email, callbackUrl: "/dashboard" }), 303);
}

export function GET() {
  return NextResponse.json({ error: "not_allowed" }, { status: 405, headers: { allow: "POST" } });
}
