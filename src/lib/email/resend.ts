import { isReservedExampleAddress } from "@/lib/demo/constants";
import { apiKeyFor, type MailFlow } from "./flows";

/**
 * Le client du fournisseur d'envoi (Resend), en `fetch` — zéro dépendance
 * (décision validée, docs/module-engagement.md §2.5). Sept points d'API et
 * rien d'autre : envoyer (par lot), déclarer / relire / vérifier un
 * domaine, lister les domaines, relire un email reçu et télécharger son
 * message brut (Partie 2). Toute erreur du fournisseur remonte
 * typée (`ResendError`) avec son statut, son code et le délai de reprise
 * qu'il demande — jamais avalée.
 *
 * DEUX CLIENTS, DEUX COMPTES (séparation des flux, audit newsletter du
 * 2026-09-17, §B.8 ; règles dans `flows.ts`) : `transactionalMail` pour
 * les emails du produit et la réception, `marketingMail` pour tout ce qui
 * part au nom d'une organisation et pour ses domaines d'expédition. Chaque
 * appel porte la clé de SON compte ; aucun point d'API n'est exporté sans
 * flux.
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

/**
 * Le délai d'attente de chaque appel au fournisseur (audit, constat D10) :
 * sans lui, un fournisseur muet retenait la fonction jusqu'à sa durée
 * maximale. Un dépassement lève `TimeoutError` (pas une `ResendError`) :
 * `deliverMessages` le traite comme « indisponible » — pause puis reprise,
 * jamais un échec définitif du message.
 */
export const RESEND_TIMEOUT_MS = 15_000;

async function call<T>(flow: MailFlow, method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKeyFor(flow)}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
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

async function sendEmailWith(flow: MailFlow, email: OutgoingEmail, idempotencyKey: string): Promise<{ id: string }> {
  assertDeliverable([email]);
  return call<{ id: string }>(flow, "POST", "/emails", toPayload(email), { "Idempotency-Key": idempotencyKey });
}

/** Jusqu'à cent emails en une requête ; la réponse suit l'ordre de la demande. */
export const BATCH_MAX = 100;

async function sendBatchWith(flow: MailFlow, emails: OutgoingEmail[], idempotencyKey: string): Promise<{ id: string }[]> {
  if (emails.length === 0) return [];
  // eslint-disable-next-line local/no-visible-text -- invariant de programmation, jamais affiché à une personne
  if (emails.length > BATCH_MAX) throw new Error(`resend: un lot ne dépasse pas ${BATCH_MAX} emails`);
  assertDeliverable(emails);
  const result = await call<{ data: { id: string }[] }>(flow, "POST", "/emails/batch", emails.map(toPayload), { "Idempotency-Key": idempotencyKey });
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

async function listDomainsWith(flow: MailFlow): Promise<{ id: string; name: string; status: string; region: string }[]> {
  const result = await call<{ data: { id: string; name: string; status: string; region: string }[] }>(flow, "GET", "/domains");
  return result.data;
}

async function getDomainWith(flow: MailFlow, id: string): Promise<ProviderDomain> {
  return call<ProviderDomain>(flow, "GET", `/domains/${encodeURIComponent(id)}`);
}

/** Déclare un domaine d'expédition : région européenne, suivi des ouvertures et des clics sous le sous-domaine `links`. */
async function createDomainWith(flow: MailFlow, name: string): Promise<ProviderDomain> {
  return call<ProviderDomain>(flow, "POST", "/domains", {
    name,
    region: SENDING_REGION,
    open_tracking: true,
    click_tracking: true,
    tracking_subdomain: "links",
  });
}

/** Demande la vérification (asynchrone) ; l'état se relit ensuite par `getDomain`. */
async function verifyDomainWith(flow: MailFlow, id: string): Promise<void> {
  await call<{ id: string }>(flow, "POST", `/domains/${encodeURIComponent(id)}/verify`);
}

/** Retire un domaine chez le fournisseur (`DELETE /domains/{id}`) — un domaine jamais vérifié que l'organisation retire ne doit pas rester dans un quota partagé. */
async function deleteDomainWith(flow: MailFlow, id: string): Promise<void> {
  await call<{ deleted: boolean }>(flow, "DELETE", `/domains/${encodeURIComponent(id)}`);
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

async function getReceivedEmailWith(flow: MailFlow, id: string): Promise<ReceivedEmail> {
  return call<ReceivedEmail>(flow, "GET", `/emails/receiving/${encodeURIComponent(id)}`);
}

/**
 * Télécharge le message brut, BORNÉ : au-delà de `maxBytes` la lecture est
 * abandonnée et `tooLarge` est rendu — jamais un message sans limite en
 * mémoire. Le lien est signé (CloudFront) : il ne porte pas la clé d'API.
 */
export async function downloadRawMessage(url: string, maxBytes: number): Promise<{ raw: Buffer | null; bytes: number; tooLarge: boolean }> {
  // Le même délai que les appels d'API, pour l'ouverture ET la lecture du corps (le signal reste armé pendant le flux).
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(RESEND_TIMEOUT_MS) });
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

// ---------------------------------------------------------------------------
// Les deux clients
// ---------------------------------------------------------------------------

function clientFor(flow: MailFlow) {
  return {
    flow,
    /** Un email, avec sa clé d'idempotence : le même appel rejoué ne l'envoie pas deux fois (24 h). */
    sendEmail: (email: OutgoingEmail, idempotencyKey: string) => sendEmailWith(flow, email, idempotencyKey),
    /** Jusqu'à cent emails en une requête ; la réponse suit l'ordre de la demande. */
    sendBatch: (emails: OutgoingEmail[], idempotencyKey: string) => sendBatchWith(flow, emails, idempotencyKey),
    listDomains: () => listDomainsWith(flow),
    getDomain: (id: string) => getDomainWith(flow, id),
    /** Déclare un domaine d'expédition : région européenne, suivi des ouvertures et des clics sous le sous-domaine `links`. */
    createDomain: (name: string) => createDomainWith(flow, name),
    /** Demande la vérification (asynchrone) ; l'état se relit ensuite par `getDomain`. */
    verifyDomain: (id: string) => verifyDomainWith(flow, id),
    /** Retire un domaine chez le fournisseur — un domaine jamais vérifié que l'organisation retire ne doit pas rester dans un quota partagé. */
    deleteDomain: (id: string) => deleteDomainWith(flow, id),
    getReceivedEmail: (id: string) => getReceivedEmailWith(flow, id),
  };
}

export type MailClient = ReturnType<typeof clientFor>;

/** Les emails du PRODUIT (lien de connexion, invitations, notifications) et la réception des emails d'ingestion : le compte historique. */
export const transactionalMail: MailClient = clientFor("transactional");

/** Tout ce qui part AU NOM D'UNE ORGANISATION (newsletters, tests, relances) et ses domaines d'expédition : le second compte, s'il est configuré. */
export const marketingMail: MailClient = clientFor("marketing");
