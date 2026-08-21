import { randomBytes, createHash } from "crypto";

/**
 * Jeton de partage — 256 bits d'aléa cryptographique, jamais dérivé d'un id
 * ou d'une donnée prévisible. Le jeton en clair n'existe qu'en mémoire, le
 * temps de cet appel puis de la réponse HTTP qui le renvoie une seule fois
 * à la création : seule son empreinte SHA-256 est destinée à être stockée
 * (`deal_shares.token_hash`).
 *
 * SHA-256 simple (pas un KDF lent type bcrypt/argon2) est un choix
 * délibéré : contrairement à un mot de passe choisi par un humain (faible
 * entropie, à ralentir contre le brute-force hors ligne), ce jeton a 256
 * bits d'entropie native — un hachage rapide suffit à empêcher l'exposition
 * en clair dans un dump, et garde le lookup en O(1) sur l'index unique de
 * `token_hash`.
 */
export function generateShareToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashShareToken(token) };
}

/** Même empreinte que `generateShareToken` — utilisée pour retrouver un partage à partir du jeton présenté par un appelant. */
export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
