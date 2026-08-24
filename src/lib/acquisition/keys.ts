import { createHash, randomBytes } from "crypto";

/**
 * Les deux clés de la collecte.
 *
 * - La clé d'API (`POST /api/leads`, serveur à serveur) est un SECRET :
 *   256 bits d'aléa, préfixée `clz_` pour être reconnaissable dans une
 *   configuration, montrée une seule fois, stockée hachée (SHA-256, même
 *   principe que le jeton de partage). `prefix` = ses 12 premiers
 *   caractères, assez pour la reconnaître dans une liste, pas pour la
 *   reconstituer.
 * - La clé de site (`POST /api/events`, navigateur) est PUBLIQUE par
 *   construction : 32 caractères hexadécimaux opaques, jamais hachée (elle
 *   ne protège rien, elle désigne), révocable et remplaçable.
 */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = `clz_${randomBytes(32).toString("base64url")}`;
  return { key, prefix: key.slice(0, 12), hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateSiteKey(): string {
  return randomBytes(16).toString("hex");
}

/** « https://www.exemple.fr:8443/page » ou « exemple.fr » → « www.exemple.fr:8443 » / « exemple.fr » ; null si illisible. */
export function normalizeDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return url.host || null;
  } catch {
    return null;
  }
}
