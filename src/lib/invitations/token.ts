import { createHash, randomBytes } from "node:crypto";

/**
 * Le JETON d'une invitation à créer un espace (docs/module-invitations.md
 * §1) — la même discipline que le jeton de partage (src/lib/deal-shares/
 * token.ts) : 256 bits d'aléa cryptographique, jamais dérivé d'un
 * identifiant ; en base, son empreinte SHA-256 sert à le retrouver, et une
 * copie CHIFFRÉE (src/lib/crypto.ts, usage ci-dessous) permet au super
 * admin de recopier le lien depuis la liste sans en générer un nouveau.
 */
export const INVITATION_SECRET_USAGE = "workspace-invitation";

/** Le paramètre de l'adresse d'inscription qui porte le jeton : `/inscription?invitation=<jeton>`. */
export const INVITATION_PARAM = "invitation";

/** La forme d'un jeton présenté : 43 caractères base64url (32 octets) — tout autre texte est refusé avant la moindre requête. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export function generateInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashInvitationToken(token) };
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function isInvitationTokenShape(value: unknown): value is string {
  return typeof value === "string" && TOKEN_SHAPE.test(value);
}

/** L'adresse complète à transmettre, sur l'origine publique de la requête. */
export function invitationUrl(origin: string, token: string): string {
  return `${origin}/inscription?${INVITATION_PARAM}=${token}`;
}
