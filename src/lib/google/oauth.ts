import { createHash, randomBytes } from "node:crypto";

/**
 * LE PROTOCOLE OAUTH DE GOOGLE, à nu (chantier réservation, étape 1).
 *
 * Module PUR : aucune importation de `next/*`, aucun accès aux cookies,
 * aucune journalisation. Il construit l'URL de consentement, échange le
 * code contre des jetons, et sait révoquer. Les routes s'occupent du
 * reste.
 *
 * DEUX PARAMÈTRES FONT TOUT : `access_type=offline` (sans lui, jamais de
 * jeton de rafraîchissement) et `prompt=consent` (sans lui, un SECOND
 * consentement ne renvoie qu'un jeton d'accès — et l'écran dirait « pas de
 * jeton » alors que le code est juste). PKCE (S256) s'ajoute par-dessus :
 * le code d'autorisation ne vaut rien sans le vérifieur resté côté serveur.
 *
 * CE QUI NE SORT JAMAIS D'ICI : le corps des réponses de Google. En échec,
 * on ne rend que le STATUT numérique — un corps d'erreur de `/token` peut
 * contenir un jeton, et il finirait recopié dans un message ou un journal.
 */

export const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const REVOKE_URL = "https://oauth2.googleapis.com/revoke";

/**
 * Les portées MINIMALES du chantier : lire les plages occupées d'un agenda
 * (pour proposer des créneaux libres) et créer l'événement du rendez-vous
 * (avec sa visioconférence). Rien de plus : pas de lecture du contenu des
 * événements, pas d'accès aux contacts.
 */
export const SCOPES = [
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.events",
] as const;

export type GoogleCredentials = { clientId: string; clientSecret: string };

/** Les identifiants du client OAuth, ou `null` quand la configuration est incomplète — la route répond alors 503. */
export function googleCredentials(env: NodeJS.ProcessEnv = process.env): GoogleCredentials | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/**
 * L'URI de redirection, déduite de l'origine de la requête. Google la
 * compare CARACTÈRE PAR CARACTÈRE à celle enregistrée sur le client
 * (schéma, hôte, port, casse, slash final) : elle doit être identique à
 * l'aller et au moment de l'échange — d'où sa présence dans l'état.
 */
export function googleRedirectUri(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/google/callback`;
}

const base64url = (buffer: Buffer): string => buffer.toString("base64url");

/** Un couple PKCE : le vérifieur reste au serveur, seul son empreinte part chez Google. */
export function pkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  return { verifier, challenge: base64url(createHash("sha256").update(verifier).digest()) };
}

export function consentUrl(input: {
  credentials: GoogleCredentials;
  redirectUri: string;
  state: string;
  challenge: string;
}): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", input.credentials.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES.join(" "));
  // Les deux paramètres qui décident de tout : hors ligne pour obtenir un jeton de rafraîchissement,
  // consentement forcé pour que Google le renvoie même si l'autorisation a déjà été donnée.
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export type ExchangeResult =
  | { ok: true; refreshToken: string | null; scope: string }
  | { ok: false; status: number };

/**
 * Le code contre les jetons. Rend le jeton de rafraîchissement et les
 * portées RÉELLEMENT accordées (le consentement granulaire permet d'en
 * décocher une : sans ce contrôle, l'échec arriverait des semaines plus
 * tard, en « insufficient permissions », loin d'ici).
 */
export async function exchangeCode(input: {
  code: string;
  verifier: string;
  redirectUri: string;
  credentials: GoogleCredentials;
}): Promise<ExchangeResult> {
  const body = new URLSearchParams({
    code: input.code,
    client_id: input.credentials.clientId,
    client_secret: input.credentials.clientSecret,
    redirect_uri: input.redirectUri,
    grant_type: "authorization_code",
    code_verifier: input.verifier,
  });
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });
  if (!response.ok) return { ok: false, status: response.status };
  const payload = (await response.json().catch(() => null)) as { refresh_token?: string; scope?: string } | null;
  if (!payload) return { ok: false, status: response.status };
  return { ok: true, refreshToken: payload.refresh_token ?? null, scope: payload.scope ?? "" };
}

/** Les portées accordées couvrent-elles ce dont le produit a besoin ? */
export function scopesCover(granted: string): boolean {
  const set = new Set(granted.split(/\s+/).filter(Boolean));
  return SCOPES.every((scope) => set.has(scope));
}

/**
 * Rendre un jeton inutilisable. Appelé quand le consentement revient
 * incomplet : on ne garde pas un jeton dont on sait qu'il échouera, et on
 * ne laisse pas traîner une autorisation dormante chez Google.
 */
export async function revokeToken(token: string): Promise<boolean> {
  const response = await fetch(REVOKE_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }).toString(),
    cache: "no-store",
  }).catch(() => null);
  return response?.ok === true;
}
