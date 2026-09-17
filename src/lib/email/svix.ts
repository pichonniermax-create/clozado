import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * La signature Svix des webhooks du fournisseur, vérifiée à la main :
 * HMAC-SHA256 de `id.timestamp.corps` avec le secret (préfixe `whsec_`
 * retiré, base64), horodatage à ±5 minutes, comparaison à temps constant.
 * Pure (pas de base), pour se tester seule.
 */
const TOLERANCE_SECONDS = 5 * 60;

export type SvixHeaders = { id: string | null; timestamp: string | null; signature: string | null };

export function verifySvixSignature(headers: SvixHeaders, body: string, secret: string): boolean {
  if (!headers.id || !headers.timestamp || !headers.signature) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) return false;
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const expected = createHmac("sha256", key).update(`${headers.id}.${headers.timestamp}.${body}`).digest();
  // L'en-tête peut porter plusieurs signatures (« v1,… v1,… ») : une seule doit correspondre.
  for (const part of headers.signature.split(" ")) {
    const [version, value] = part.split(",", 2);
    if (version !== "v1" || !value) continue;
    const candidate = Buffer.from(value, "base64");
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) return true;
  }
  return false;
}

/**
 * Deux comptes, deux secrets (séparation des flux, audit newsletter §B.8) :
 * un webhook est accepté s'il porte la signature de l'UN des secrets
 * configurés — le compte transactionnel (emails reçus, liens de connexion)
 * ou le compte marketing (newsletters, relances). Aucun secret = rien
 * n'est accepté.
 */
export function verifySvixSignatureWithAny(headers: SvixHeaders, body: string, secrets: readonly string[]): boolean {
  return secrets.some((secret) => verifySvixSignature(headers, body, secret));
}

/** Pour les tests et les preuves : la signature qu'un compte poserait avec ce secret. */
export function signSvix(id: string, timestamp: string, body: string, secret: string): string {
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  return `v1,${createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")}`;
}
