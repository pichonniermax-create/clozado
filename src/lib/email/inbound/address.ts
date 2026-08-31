import { randomBytes } from "node:crypto";

/**
 * L'ADRESSE D'INGESTION d'une organisation (docs/module-engagement.md §4.1)
 * — `<jeton>@in.<domaine>`. Le jeton EST le secret : c'est lui qui autorise
 * un email à entrer, avant même qu'on regarde qui l'envoie. Seize
 * caractères tirés de `crypto.randomBytes` sur un alphabet de trente-six
 * (~82 bits) : deviner une adresse est hors de portée, et la régénérer
 * coupe l'ancienne à l'instant même.
 */

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const TOKEN_LENGTH = 16;
/** 252 = 36 × 7 : au-delà, l'octet est rejeté — sinon les sept premières lettres sortiraient plus souvent. */
const UNBIASED_LIMIT = 252;

export function generateIngestToken(): string {
  let token = "";
  while (token.length < TOKEN_LENGTH) {
    for (const byte of randomBytes(TOKEN_LENGTH)) {
      if (byte >= UNBIASED_LIMIT) continue;
      token += ALPHABET[byte % ALPHABET.length];
      if (token.length === TOKEN_LENGTH) break;
    }
  }
  return token;
}

/** « a7k2… » + « in.clozado.fr » → « a7k2…@in.clozado.fr ». */
export function ingestAddress(token: string, domain: string): string {
  return `${token}@${domain}`;
}
