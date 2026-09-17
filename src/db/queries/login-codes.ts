import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { LOGIN_CODE_MAX_ATTEMPTS, loginCodes, verificationTokens } from "@/db/schema";
import { hashLoginCode, hashVerificationToken, newVerificationToken } from "@/lib/auth/magic-link";
import { required } from "@/lib/email/env";

/**
 * Les codes à six chiffres (correctif du lien de connexion, 2026-09-17) et
 * ce qu'il faut pour transformer un code juste en session : un jeton
 * d'Auth.js neuf, stocké haché comme les siens, que le navigateur porte au
 * callback. Le code lui-même n'est jamais stocké en clair ; il meurt avec le
 * lien, après cinq essais, ou dès qu'il a servi.
 */
/** Le secret d'Auth.js, celui qui hache ses jetons — absent, l'erreur de configuration est celle du socle. */
const secret = () => required("AUTH_SECRET");

/** Enregistre (ou remplace) le code d'une adresse, avec l'expiration du lien. */
export async function storeLoginCode(email: string, code: string, expiresAt: Date): Promise<void> {
  const normalized = email.toLowerCase();
  const codeHash = hashLoginCode(normalized, code, secret());
  await db
    .insert(loginCodes)
    .values({ email: normalized, codeHash, expiresAt, attempts: 0, createdAt: new Date() })
    .onConflictDoUpdate({ target: loginCodes.email, set: { codeHash, expiresAt, attempts: 0, createdAt: new Date() } });
}

export type LoginCodeOutcome = "ok" | "invalid" | "expired" | "locked" | "missing";

/**
 * Vérifie un code : un essai est compté AVANT la comparaison (un code
 * deviné à la dernière tentative compte comme un essai) ; un code juste est
 * supprimé, un code épuisé ou expiré aussi.
 */
export async function consumeLoginCode(email: string, code: string): Promise<LoginCodeOutcome> {
  const normalized = email.toLowerCase();
  const row = await db.query.loginCodes.findFirst({ where: eq(loginCodes.email, normalized) });
  if (!row) return "missing";
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(loginCodes).where(eq(loginCodes.email, normalized));
    return "expired";
  }
  if (row.attempts >= LOGIN_CODE_MAX_ATTEMPTS) {
    await db.delete(loginCodes).where(eq(loginCodes.email, normalized));
    return "locked";
  }
  const attempts = row.attempts + 1;
  if (row.codeHash !== hashLoginCode(normalized, code, secret())) {
    if (attempts >= LOGIN_CODE_MAX_ATTEMPTS) await db.delete(loginCodes).where(eq(loginCodes.email, normalized));
    else await db.update(loginCodes).set({ attempts }).where(and(eq(loginCodes.email, normalized), eq(loginCodes.attempts, row.attempts)));
    return attempts >= LOGIN_CODE_MAX_ATTEMPTS ? "locked" : "invalid";
  }
  await db.delete(loginCodes).where(eq(loginCodes.email, normalized));
  return "ok";
}

/** Un jeton de connexion neuf pour cette adresse, à porter au callback d'Auth.js — valable deux minutes, le temps du 303. */
export async function issueVerificationToken(email: string, ttlSeconds = 120): Promise<string> {
  const token = newVerificationToken();
  await db.insert(verificationTokens).values({ identifier: email, token: hashVerificationToken(token, secret()), expires: new Date(Date.now() + ttlSeconds * 1000) });
  return token;
}

export type TokenState = "valid" | "expired" | "missing";

/** L'état d'un jeton de lien SANS le consommer (la page de confirmation) : Auth.js seul le consomme, au callback. */
export async function peekVerificationToken(email: string, token: string): Promise<TokenState> {
  const row = await db.query.verificationTokens.findFirst({
    where: and(eq(verificationTokens.identifier, email), eq(verificationTokens.token, hashVerificationToken(token, secret()))),
  });
  if (!row) return "missing";
  return row.expires.getTime() < Date.now() ? "expired" : "valid";
}

/** Ménage : les codes expirés d'avant hier (aucun index à parcourir, la table reste petite). */
export async function purgeExpiredLoginCodes(): Promise<number> {
  const result = await db.delete(loginCodes).where(lt(loginCodes.expiresAt, sql`now() - interval '1 day'`));
  return result.rowCount ?? 0;
}
