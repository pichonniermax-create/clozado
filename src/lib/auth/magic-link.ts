import { createHash, randomBytes, randomInt } from "node:crypto";

/**
 * LE LIEN DE CONNEXION, côté pur (correctif du 2026-09-17) : ce qui
 * s'exerce sans base ni navigateur.
 *
 * Le constat : Auth.js consomme le jeton sur le simple GET du lien
 * (`/api/auth/callback/resend?token=…`), et un scanner anti-spam ou
 * l'aperçu de lien d'une messagerie ouvre le lien AVANT la personne — qui
 * trouve alors « lien déjà utilisé ». Le correctif : l'email pointe vers
 * NOTRE page de confirmation, qui ne consomme rien ; seul un geste
 * explicite (le bouton « Me connecter », un POST) envoie le navigateur sur
 * le callback d'Auth.js. Et un code à six chiffres, dans le même email,
 * pour le cas où le lien pose problème.
 */

/** Le chemin du callback d'Auth.js pour le fournisseur `resend` (identifiant du fournisseur, pas le transport). */
export const CALLBACK_PATH = "/api/auth/callback/resend";
/** Notre page de confirmation : un GET n'y consomme rien. */
export const CONFIRM_PATH = "/login/confirmer";

export type MagicLinkParts = { origin: string; token: string; email: string; callbackUrl: string };

/** Les trois paramètres qu'Auth.js pose dans son lien, ou null si l'adresse n'est pas la sienne. */
export function parseCallbackUrl(url: string): MagicLinkParts | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.pathname !== CALLBACK_PATH) return null;
  const token = parsed.searchParams.get("token");
  const email = parsed.searchParams.get("email");
  const callbackUrl = parsed.searchParams.get("callbackUrl") ?? "/";
  if (!token || !email) return null;
  return { origin: parsed.origin, token, email, callbackUrl };
}

/** L'adresse mise dans l'email : notre page de confirmation, avec les mêmes paramètres. */
export function confirmationUrl(parts: MagicLinkParts): string {
  const url = new URL(CONFIRM_PATH, parts.origin);
  url.search = new URLSearchParams({ token: parts.token, email: parts.email, callbackUrl: parts.callbackUrl }).toString();
  return url.toString();
}

/** Le callback d'Auth.js, reconstruit à l'identique pour le geste explicite (POST → 303 → GET par le navigateur). */
export function callbackUrl(parts: MagicLinkParts): string {
  const url = new URL(CALLBACK_PATH, parts.origin);
  url.search = new URLSearchParams({ callbackUrl: parts.callbackUrl, token: parts.token, email: parts.email }).toString();
  return url.toString();
}

/** Un chemin de retour interne seulement : jamais une adresse étrangère dans le callback reconstruit. */
export function safeCallbackPath(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

/** L'empreinte d'un jeton telle qu'Auth.js la stocke : SHA-256 hexadécimal de `jeton + secret`. */
export function hashVerificationToken(token: string, secret: string): string {
  return createHash("sha256").update(`${token}${secret}`).digest("hex");
}

/** Un jeton de connexion neuf, au même format qu'Auth.js (32 octets aléatoires en hexadécimal). */
export function newVerificationToken(): string {
  return randomBytes(32).toString("hex");
}

/** Le jeton a-t-il la forme d'un jeton d'Auth.js ? (hexadécimal, 32 à 128 caractères) */
export function isTokenShape(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[0-9a-f]{32,128}$/i.test(value);
}

// ---------------------------------------------------------------------------
// Le code à six chiffres
// ---------------------------------------------------------------------------

export const LOGIN_CODE_LENGTH = 6;

/** Six chiffres, zéros de tête compris, tirés au sort de façon uniforme. */
export function newLoginCode(): string {
  return String(randomInt(0, 10 ** LOGIN_CODE_LENGTH)).padStart(LOGIN_CODE_LENGTH, "0");
}

/** Ce que la personne a tapé, sans espaces ni tirets : six chiffres ou rien. */
export function normalizeLoginCode(value: string | null | undefined): string | null {
  const digits = String(value ?? "").replace(/[^0-9]/g, "");
  return digits.length === LOGIN_CODE_LENGTH ? digits : null;
}

/** Le code affiché dans l'email : « 123 456 », lisible d'un coup d'œil. */
export function formatLoginCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

/** L'empreinte d'un code, liée à l'adresse : un même code chez deux adresses n'a pas la même empreinte. */
export function hashLoginCode(email: string, code: string, secret: string): string {
  return createHash("sha256").update(`${email.toLowerCase()}:${code}:${secret}`).digest("hex");
}

/** « 60 minutes » → « 1 heure », « 90 » → « 1 h 30 » : la durée lisible du lien, dans la langue du message. */
export function validityLabel(minutes: number, locale: "fr" | "en"): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return locale === "fr" ? `${m} minutes` : `${m} minutes`;
  if (m === 0) return locale === "fr" ? (h === 1 ? "1 heure" : `${h} heures`) : h === 1 ? "1 hour" : `${h} hours`;
  return locale === "fr" ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h ${String(m).padStart(2, "0")}`;
}
