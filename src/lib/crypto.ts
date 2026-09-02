import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Le chiffrement des secrets conservés en base (chantier engagement,
 * Partie 3) : AES-256-GCM, clé dérivée d'`AUTH_SECRET` par HKDF avec une
 * étiquette PAR USAGE — deux usages différents ne partagent jamais une
 * clé, et changer `AUTH_SECRET` invalide tout (comme les sessions).
 * Format sérialisé : `v1:<iv>:<tag>:<chiffré>` en base64 — versionné pour
 * pouvoir changer d'algorithme sans deviner.
 */

const VERSION = "v1";

function keyFor(usage: string): Buffer {
  const secret = process.env.AUTH_SECRET;
  // eslint-disable-next-line local/no-visible-text -- erreur de configuration serveur, jamais montrée à une personne
  if (!secret) throw new Error("AUTH_SECRET manquant : impossible de chiffrer ou déchiffrer un secret.");
  return Buffer.from(hkdfSync("sha256", secret, "clozado-secret-store", usage, 32));
}

export function encryptSecret(plain: string, usage: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(usage), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(":");
}

/** Rend null pour un format inconnu ou un secret altéré — jamais une exception à attraper partout. */
export function decryptSecret(payload: string, usage: string): string | null {
  const [version, iv, tag, encrypted] = payload.split(":");
  if (version !== VERSION || !iv || !tag || !encrypted) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyFor(usage), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
