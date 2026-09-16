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

/** Ce que le webhook `email.received` dit des destinataires — des métadonnées seulement. */
export type RecipientNotice = { to?: string[]; cc?: string[]; bcc?: string[]; receivedFor?: string[] };

/**
 * L'adresse d'ingestion visée, cherchée dans TOUT ce qui désigne un
 * destinataire — `received_for` compris : quand le membre met l'adresse en
 * Cci (le cas « copie »), c'est la seule trace qu'il en reste. La copie
 * VISIBLE (Cc) compte aussi (stabilisation, P5) : la chasse aux failles du
 * 2026-09-14 l'avait écartée parce qu'une adresse en Cc se retrouve chez
 * tous les destinataires du fil — mais la refuser ne la rend pas moins
 * visible, ça perd seulement l'email du membre, en silence ; le secret
 * protège l'entrée (couches 3 et 4 : expéditeur membre et authentifié),
 * pas la lecture de l'adresse. L'écran conseille la Cci.
 */
export function findIngestToken(notice: RecipientNotice, domain: string): string | null {
  const suffix = `@${domain.toLowerCase()}`;
  const candidates = [...(notice.receivedFor ?? []), ...(notice.to ?? []), ...(notice.cc ?? []), ...(notice.bcc ?? [])];
  for (const raw of candidates) {
    const address = raw.trim().toLowerCase();
    if (!address.endsWith(suffix)) continue;
    const token = address.slice(0, -suffix.length).replace(/\+.*$/, "");
    if (token) return token;
  }
  return null;
}
