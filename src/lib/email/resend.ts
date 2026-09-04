import { isReservedExampleAddress } from "@/lib/demo/constants";
import { resendApiKey } from "./config";

/**
 * Le client du fournisseur d'envoi (Resend), en `fetch` — zéro dépendance
 * (décision validée, docs/module-engagement.md §2.5). Sept points d'API et
 * rien d'autre : envoyer (par lot), déclarer / relire / vérifier un
 * domaine, lister les domaines, relire un email reçu et télécharger son
 * message brut (Partie 2). Toute erreur du fournisseur remonte
 * typée (`ResendError`) avec son statut, son code et le délai de reprise
 * qu'il demande — jamais avalée.
 */

const BASE_URL = "https://api.resend.com";

export class ResendError extends Error {
  readonly status: number;
  /** Le code du fournisseur (« validation_error », « daily_quota_exceeded », « rate_limit_exceeded »…) ; null s'il n'en donne pas. */
  readonly code: string | null;
  /** Secondes à attendre avant de réessayer (en-tête `retry-after`), quand le fournisseur les donne. */
  readonly retryAfterSeconds: number | null;
  constructor(status: number, code: string | null, message: string, retryAfterSeconds: number | null) {
    super(message);
    this.name = "ResendError";
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
  /** Un quota du plan est atteint (jour ou mois) : rien ne partira avant qu'il se libère. */
  get quotaExceeded(): boolean {
    return this.code === "daily_quota_exceeded" || this.code === "monthly_quota_exceeded";
  }
  /** Trop de requêtes par seconde : réessayer après `retryAfterSeconds`. */
  get rateLimited(): boolean {
    return this.status === 429 && !this.quotaExceeded;
  }
}

async function call<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${resendApiKey()}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    const error = (json ?? {}) as { name?: string; message?: string; error?: string };
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new ResendError(
      response.status,
      error.name ?? null,
      error.message ?? error.error ?? `Resend ${response.status}`,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null
    );
  }
  return json as T;
}

// ---------------------------------------------------------------------------
// Envoi
// ---------------------------------------------------------------------------

export type OutgoingEmail = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  headers?: Record<string, string>;
  tags?: { name: string; value: string }[];
};

/** Le format attendu par l'API (snake_case), construit ici et nulle part ailleurs. */
function toPayload(email: OutgoingEmail) {
  return {
    from: email.from,
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    ...(email.replyTo ? { reply_to: email.replyTo } : {}),
    ...(email.headers ? { headers: email.headers } : {}),
    ...(email.tags ? { tags: email.tags } : {}),
  };
}

/** Un email, avec sa clé d'idempotence : le même appel rejoué ne l'envoie pas deux fois (24 h). */
/**
 * La ceinture sous le blocage par organisation (docs/module-demo.md §1.2) :
 * un destinataire sur un domaine réservé aux exemples (RFC 2606/6761 —
 * celui du jeu de données de démo) n'est jamais transmis au fournisseur,
 * quel que soit le chemin d'envoi. Refus = un lot « rejeté » pour
 * `deliverMessages`, le message passe en échec avec ce motif.
 */
function assertDeliverable(emails: OutgoingEmail[]): void {
  const reserved = emails.flatMap((e) => e.to).find((to) => isReservedExampleAddress(to));
  if (reserved) throw new ResendError(400, "reserved_recipient", `resend: reserved_recipient ${reserved}`, null);
}

export async function sendEmail(email: OutgoingEmail, idempotencyKey: string): Promise<{ id: string }> {
  assertDeliverable([email]);
  return call<{ id: string }>("POST", "/emails", toPayload(email), { "Idempotency-Key": idempotencyKey });
}

/** Jusqu'à cent emails en une requête ; la réponse suit l'ordre de la demande. */
export const BATCH_MAX = 100;

export async function sendBatch(emails: OutgoingEmail[], idempotencyKey: string): Promise<{ id: string }[]> {
  if (emails.length === 0) return [];
  // eslint-disable-next-line local/no-visible-text -- invariant de programmation, jamais affiché à une personne
  if (emails.length > BATCH_MAX) throw new Error(`resend: un lot ne dépasse pas ${BATCH_MAX} emails`);
  assertDeliverable(emails);
  const result = await call<{ data: { id: string }[] }>("POST", "/emails/batch", emails.map(toPayload), { "Idempotency-Key": idempotencyKey });
  return result.data;
}

// ---------------------------------------------------------------------------
// Domaines
// ---------------------------------------------------------------------------

/** Un enregistrement DNS tel que le fournisseur le renvoie — stocké tel quel, jamais recomposé. */
export type DomainRecord = {
  record: string;
  name: string;
  type: string;
  ttl: string;
  status: string;
  value: string;
  priority?: number;
};

export type ProviderDomain = {
  id: string;
  name: string;
  status: string;
  region: string;
  created_at: string;
  records: DomainRecord[];
};

export const SENDING_REGION = "eu-west-1";

export async function listDomains(): Promise<{ id: string; name: string; status: string; region: string }[]> {
  const result = await call<{ data: { id: string; name: string; status: string; region: string }[] }>("GET", "/domains");
  return result.data;
}

export async function getDomain(id: string): Promise<ProviderDomain> {
  return call<ProviderDomain>("GET", `/domains/${encodeURIComponent(id)}`);
}

/** Déclare un domaine d'expédition : région européenne, suivi des ouvertures et des clics sous le sous-domaine `links`. */
export async function createDomain(name: string): Promise<ProviderDomain> {
  return call<ProviderDomain>("POST", "/domains", {
    name,
    region: SENDING_REGION,
    open_tracking: true,
    click_tracking: true,
    tracking_subdomain: "links",
  });
}

/** Demande la vérification (asynchrone) ; l'état se relit ensuite par `getDomain`. */
export async function verifyDomain(id: string): Promise<void> {
  await call<{ id: string }>("POST", `/domains/${encodeURIComponent(id)}/verify`);
}

// ---------------------------------------------------------------------------
// Réception (Partie 2 — l'ingestion, docs/module-engagement.md §4.1)
// ---------------------------------------------------------------------------

/**
 * Un email REÇU tel que le fournisseur le rend (`GET /emails/receiving/{id}`).
 * Le webhook `email.received` ne porte QUE des métadonnées : le contenu se
 * relit ici, et le message brut — celui que l'authentification examine — se
 * télécharge par `raw.download_url`, un lien signé valable une heure.
 * Les pièces jointes ne sont jamais téléchargées.
 */
export type ReceivedEmail = {
  id: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  /** Les adresses pour lesquelles le message a été reçu (clause `for` des en-têtes `Received`) — la seule trace d'une adresse en Cci. */
  received_for?: string[];
  subject: string | null;
  html: string | null;
  text: string | null;
  headers: Record<string, string>;
  created_at: string;
  message_id?: string | null;
  raw: { download_url: string; expires_at: string } | null;
  attachments?: { id: string; filename?: string; content_type?: string }[];
};

export async function getReceivedEmail(id: string): Promise<ReceivedEmail> {
  return call<ReceivedEmail>("GET", `/emails/receiving/${encodeURIComponent(id)}`);
}

/**
 * Télécharge le message brut, BORNÉ : au-delà de `maxBytes` la lecture est
 * abandonnée et `tooLarge` est rendu — jamais un message sans limite en
 * mémoire. Le lien est signé (CloudFront) : il ne porte pas la clé d'API.
 */
export async function downloadRawMessage(url: string, maxBytes: number): Promise<{ raw: Buffer | null; bytes: number; tooLarge: boolean }> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new ResendError(response.status, null, `resend: téléchargement du brut ${response.status}`, null);
  }
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel();
    return { raw: null, bytes: declared, tooLarge: true };
  }
  if (!response.body) return { raw: null, bytes: 0, tooLarge: false };
  const chunks: Buffer[] = [];
  let bytes = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      return { raw: null, bytes, tooLarge: true };
    }
    chunks.push(Buffer.from(value));
  }
  return { raw: Buffer.concat(chunks), bytes, tooLarge: false };
}
