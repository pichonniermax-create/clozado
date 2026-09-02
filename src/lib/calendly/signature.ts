import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * La signature des webhooks Calendly : en-tête
 * `Calendly-Webhook-Signature: t=<horodatage>,v1=<hmac>`, HMAC-SHA256
 * hexadécimal de `t.corps` avec la clé de signature de la connexion.
 * Même discipline que Svix (webhooks Resend) : corps BRUT, tolérance
 * temporelle, comparaison en temps constant, boucle sur les `v1`.
 * L'horodatage est accepté en secondes ou en millisecondes — la
 * tolérance (5 minutes) se mesure pareil.
 */

const TOLERANCE_MS = 5 * 60 * 1000;

export function verifyCalendlySignature(header: string | null, body: string, signingKey: string): boolean {
  if (!header) return false;
  let timestamp: string | null = null;
  const candidates: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2).map((s) => s?.trim());
    if (key === "t" && value) timestamp = value;
    if (key === "v1" && value) candidates.push(value);
  }
  if (!timestamp || candidates.length === 0) return false;
  const numeric = Number(timestamp);
  if (!Number.isFinite(numeric)) return false;
  const at = numeric >= 1e12 ? numeric : numeric * 1000;
  if (Math.abs(Date.now() - at) > TOLERANCE_MS) return false;
  const expected = Buffer.from(createHmac("sha256", signingKey).update(`${timestamp}.${body}`).digest("hex"));
  for (const candidate of candidates) {
    const buffer = Buffer.from(candidate);
    if (buffer.length === expected.length && timingSafeEqual(buffer, expected)) return true;
  }
  return false;
}
