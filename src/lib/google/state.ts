import { randomBytes, timingSafeEqual } from "node:crypto";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

/**
 * L'ÉTAT DU CONSENTEMENT, dans un cookie chiffré (chantier réservation,
 * étape 1) — pas de table, pas de ligne à nettoyer.
 *
 * Le cookie porte trois choses, chiffrées-authentifiées avec `AUTH_SECRET`
 * (AES-256-GCM, clé dérivée par usage) : le jeton anti-CSRF (`state`) que
 * Google doit nous rendre tel quel, le VÉRIFIEUR PKCE qui ne doit jamais
 * quitter le serveur, et l'URI de redirection utilisée à l'aller (Google
 * exige la même à l'échange). Plus la personne qui a lancé le consentement
 * et une date d'expiration : dix minutes, le temps de cliquer.
 *
 * `SameSite=Lax` et non `Strict` : le retour de Google est une navigation
 * de premier niveau venue d'un autre site — en `Strict`, le cookie ne
 * reviendrait jamais et chaque tentative finirait en « état absent ».
 */

export const STATE_USAGE = "google-oauth-state";
/** Dix minutes : le temps de choisir un compte et de consentir, pas plus. */
export const STATE_MAX_AGE_SECONDS = 600;

/** `__Host-` exige HTTPS : en local (http) le navigateur refuserait le cookie, en silence. */
export function stateCookieName(origin: string): string {
  return origin.startsWith("https://") ? "__Host-google-oauth" : "google-oauth";
}

type StatePayload = { state: string; verifier: string; uid: string; redirectUri: string; exp: number };

export type IssuedState = { state: string; verifier: string; value: string };

/** Fabrique l'état : le jeton qui part chez Google, le vérifieur qui reste, et la valeur du cookie. */
export function issueState(input: { uid: string; redirectUri: string; verifier: string; now: number }): IssuedState {
  const state = randomBytes(24).toString("base64url");
  const payload: StatePayload = {
    state,
    verifier: input.verifier,
    uid: input.uid,
    redirectUri: input.redirectUri,
    exp: input.now + STATE_MAX_AGE_SECONDS * 1000,
  };
  return { state, verifier: input.verifier, value: encryptSecret(JSON.stringify(payload), STATE_USAGE) };
}

export type ConsumedState =
  | { ok: true; verifier: string; redirectUri: string }
  | { ok: false; reason: "absent" | "illisible" | "expire" | "etat" | "personne" | "redirection" };

/** Comparaison à temps constant de deux jetons — un état se compare comme un secret. */
function sameToken(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Relit l'état et le confronte au retour de Google. Tout écart referme la
 * porte : cookie absent ou altéré, expiré, `state` différent, autre
 * personne connectée, redirection différente de celle de l'aller.
 */
export function consumeState(
  value: string | undefined,
  input: { state: string | null; uid: string; redirectUri: string; now: number }
): ConsumedState {
  if (!value) return { ok: false, reason: "absent" };
  const raw = decryptSecret(value, STATE_USAGE);
  if (!raw) return { ok: false, reason: "illisible" };
  let payload: StatePayload;
  try {
    payload = JSON.parse(raw) as StatePayload;
  } catch {
    return { ok: false, reason: "illisible" };
  }
  if (!payload?.state || !payload.verifier || !payload.uid || !payload.redirectUri || !payload.exp) {
    return { ok: false, reason: "illisible" };
  }
  if (payload.exp <= input.now) return { ok: false, reason: "expire" };
  if (!input.state || !sameToken(payload.state, input.state)) return { ok: false, reason: "etat" };
  if (payload.uid !== input.uid) return { ok: false, reason: "personne" };
  if (payload.redirectUri !== input.redirectUri) return { ok: false, reason: "redirection" };
  return { ok: true, verifier: payload.verifier, redirectUri: payload.redirectUri };
}
