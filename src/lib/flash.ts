import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * LES MESSAGES ÉPHÉMÈRES SIGNÉS (stabilisation, S5). Une action serveur
 * revient à l'écran avec sa phrase en paramètre d'URL (`withError`,
 * src/lib/form-actions.ts) ; avant, la phrase était réfléchie telle
 * quelle — n'importe quel lien forgé faisait afficher n'importe quoi dans
 * une page authentifiée (hameçonnage dans l'application). Ici, la phrase
 * part avec une signature HMAC calculée sur le secret du serveur : un
 * lecteur (`readFlash`, ou l'action `revealFlash` pour les notifications)
 * ne rend QUE ce que le serveur a lui-même écrit ; tout le reste est
 * ignoré en silence. Les 190 appelants de `withError` ne changent pas.
 */

/** Seize octets de HMAC-SHA256 en base64url : assez pour qu'une signature ne se devine pas, court dans une adresse. */
const SIGNATURE_LENGTH = 22;
/** Une phrase plus longue n'est pas un message d'action : refusée à la lecture. */
const MAX_TOKEN_LENGTH = 4096;

function secret(): string | null {
  const value = process.env.AUTH_SECRET?.trim();
  return value ? value : null;
}

function signatureOf(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url").slice(0, SIGNATURE_LENGTH);
}

/** La phrase → un jeton `<base64url(phrase)>.<signature>` à poser dans l'adresse. */
export function signFlash(message: string): string {
  const payload = Buffer.from(message, "utf8").toString("base64url");
  const key = secret();
  // Sans secret (jamais en production : Auth.js l'exige), le jeton part sans signature — et ne s'affiche donc jamais.
  if (!key) return payload;
  return `${payload}.${signatureOf(payload, key)}`;
}

/** Le jeton lu dans l'adresse → la phrase, ou `undefined` pour tout ce que le serveur n'a pas signé. */
export function readFlash(value: string | string[] | null | undefined): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_TOKEN_LENGTH) return undefined;
  const key = secret();
  if (!key) return undefined;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return undefined;
  const payload = value.slice(0, dot);
  const given = value.slice(dot + 1);
  if (given.length !== SIGNATURE_LENGTH) return undefined;
  const expected = signatureOf(payload, key);
  if (!timingSafeEqual(Buffer.from(given, "utf8"), Buffer.from(expected, "utf8"))) return undefined;
  const message = Buffer.from(payload, "base64url").toString("utf8");
  return message.length > 0 ? message : undefined;
}
