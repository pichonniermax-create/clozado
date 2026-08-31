import {
  countInboundSince,
  findMemberByEmail,
  findOrganizationByIngestToken,
  inboundExistsByMessageId,
  insertInboundEmail,
  listMemberEmails,
  recordInboundRejection,
  type RejectionReason,
} from "@/db/queries/inbound";
import { inboundDomain } from "../config";
import { downloadRawMessage, getReceivedEmail, type ReceivedEmail } from "../resend";
import { authenticateSender } from "./authenticate";
import { extractEmail, extractEmails, firstHeader, parseRawMessage } from "./mime";
import { parseInbound } from "./parse";
import { proposeSignature } from "./signature";

/**
 * L'INGESTION D'UN EMAIL REÇU (docs/module-engagement.md §4) — les quatre
 * couches du §4.2, dans l'ordre qui protège la base :
 *
 * 1. **l'adresse est un secret** : un jeton inconnu ne fait qu'incrémenter
 *    un compteur (`inbound_rejections`), rien d'autre n'est lu ;
 * 2. **le débit** vient tout de suite après l'organisation (le §4.2 le
 *    numérote 4 ; il est évalué ici en PREMIER pour qu'un flot ne remplisse
 *    pas la table avec des refus) — au-delà, un refus par email, borné ;
 * 3. **l'expéditeur est un membre** : l'adresse du `From` doit être celle
 *    d'un utilisateur de l'organisation, sinon refus sans lire le corps ;
 * 4. **l'expéditeur est authentifié**, calculé par nous depuis le message
 *    brut (DKIM aligné, sinon SPF aligné) — jamais un en-tête
 *    `Authentication-Results`, qu'un expéditeur peut écrire lui-même.
 *
 * Ce qui passe les quatre couches est parsé (transfert ou copie,
 * contrepartie, date d'origine, signature proposée) et posé `pending` :
 * une PROPOSITION, que quelqu'un confirme. Le contenu reçu n'est jamais
 * exécuté ni interprété — il est stocké comme texte, et le corps n'est
 * conservé que si l'organisation l'a demandé.
 */

/** Le brut au-delà duquel on n'authentifie pas : personne ne transfère cinq mégaoctets de texte. */
const MAX_RAW_BYTES = 5 * 1024 * 1024;
/** Le texte lisible au-delà duquel on refuse (le corps stocké reste borné). */
const MAX_TEXT_BYTES = 1024 * 1024;
const RATE_PER_HOUR = 60;
const RATE_PER_DAY = 300;

export type IngestOutcome =
  /** Pas pour nous : aucune adresse du domaine d'ingestion dans les destinataires. */
  | { outcome: "not_for_us" }
  /** Jeton inconnu : compté, rien de plus. */
  | { outcome: "unknown_address" }
  /** Déjà ingéré (même identifiant de fournisseur, ou même `Message-ID` pour cette organisation). */
  | { outcome: "duplicate" }
  | { outcome: "rejected"; reason: RejectionReason; id: string | null }
  | { outcome: "stored"; id: string };

/** Ce que le webhook `email.received` porte — des métadonnées seulement (le contenu se relit ensuite). */
export type ReceivedNotice = {
  emailId: string;
  from?: string | null;
  to?: string[];
  cc?: string[];
  bcc?: string[];
  receivedFor?: string[];
  subject?: string | null;
  messageId?: string | null;
  createdAt?: string | null;
};

/**
 * L'adresse d'ingestion visée, cherchée dans TOUT ce qui désigne un
 * destinataire — `received_for` compris : quand le membre met l'adresse en
 * Cci (le cas « copie »), c'est la seule trace qu'il en reste.
 */
export function findIngestToken(notice: ReceivedNotice, domain: string): string | null {
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

export async function ingestReceivedEmail(notice: ReceivedNotice): Promise<IngestOutcome> {
  const domain = inboundDomain();
  const token = findIngestToken(notice, domain);
  if (!token) return { outcome: "not_for_us" };

  // 1. L'adresse est un secret.
  const organization = await findOrganizationByIngestToken(token);
  if (!organization) {
    await recordInboundRejection("unknown_address", token.slice(0, 4));
    return { outcome: "unknown_address" };
  }

  const receivedAt = notice.createdAt ? new Date(notice.createdAt) : new Date();
  const at = Number.isNaN(receivedAt.getTime()) ? new Date() : receivedAt;
  // Le fournisseur peut rendre « Nom <a@b> » comme « a@b » : une seule lecture pour les deux.
  const senderEmail = extractEmail(notice.from) ?? "";
  const messageIdHeader = notice.messageId?.trim() || null;

  const reject = async (reason: RejectionReason, extra: Partial<Parameters<typeof insertInboundEmail>[0]> = {}): Promise<IngestOutcome> => {
    const row = await insertInboundEmail({
      organizationId: organization.id,
      providerEmailId: notice.emailId,
      messageIdHeader,
      receivedAt: at,
      senderEmail: senderEmail || "?",
      senderUserId: null,
      authResult: "unavailable",
      authDetail: null,
      status: "rejected",
      rejectionReason: reason,
      mode: null,
      subject: notice.subject ?? null,
      counterpartEmail: null,
      counterpartName: null,
      originalDate: null,
      proposal: null,
      bodyText: null,
      sizeBytes: null,
      ...extra,
    });
    return { outcome: "rejected", reason, id: row?.id ?? null };
  };

  // 2. Le débit — avant tout appel au fournisseur : un flot ne coûte qu'un compte.
  const hour = new Date(at.getTime() - 60 * 60 * 1000);
  const day = new Date(at.getTime() - 24 * 60 * 60 * 1000);
  const [lastHour, lastDay] = await Promise.all([countInboundSince(organization.id, hour), countInboundSince(organization.id, day)]);
  if (lastHour >= RATE_PER_HOUR || lastDay >= RATE_PER_DAY) return reject("rate_limited");

  // Un doublon : le même message renvoyé deux fois par le fournisseur.
  if (messageIdHeader && (await inboundExistsByMessageId(organization.id, messageIdHeader))) return { outcome: "duplicate" };

  // 3. L'expéditeur est un membre. Le `Return-Path`, lui, est vérifié par
  //    l'ALIGNEMENT à la couche suivante (§4.2) : une adresse d'enveloppe
  //    est écrite par le serveur d'envoi, ce n'est jamais celle d'une
  //    personne (« bounces+…@… » chez tous les fournisseurs).
  if (!senderEmail) return reject("sender_not_member");
  const member = await findMemberByEmail(organization.id, senderEmail);
  if (!member) return reject("sender_not_member");

  // Le contenu lisible et le message brut — jamais les pièces jointes.
  let email: ReceivedEmail;
  try {
    email = await getReceivedEmail(notice.emailId);
  } catch {
    return reject("unreadable", { senderUserId: member.id });
  }

  const text = email.text ?? "";
  if (Buffer.byteLength(text, "utf8") > MAX_TEXT_BYTES || Buffer.byteLength(email.html ?? "", "utf8") > MAX_TEXT_BYTES) {
    return reject("too_large", { senderUserId: member.id });
  }

  let raw: Buffer | null = null;
  let sizeBytes: number | null = null;
  if (email.raw?.download_url) {
    try {
      const downloaded = await downloadRawMessage(email.raw.download_url, MAX_RAW_BYTES);
      if (downloaded.tooLarge) return reject("too_large", { senderUserId: member.id, sizeBytes: downloaded.bytes });
      raw = downloaded.raw;
      sizeBytes = downloaded.bytes;
    } catch {
      raw = null;
    }
  }

  // 4. L'authentification, calculée par nous depuis le brut.
  const auth = await authenticateSender(raw, senderEmail);
  const authenticated = auth.result === "dkim_aligned" || auth.result === "spf_aligned";
  if (!authenticated) {
    return reject("sender_not_authenticated", { senderUserId: member.id, authResult: auth.result, authDetail: auth.detail, sizeBytes });
  }

  // Le parseur — déterministe, puis la signature proposée.
  const memberEmails = await listMemberEmails(organization.id);
  // Les destinataires : ceux des EN-TÊTES du message brut, pas ceux que le
  // fournisseur rend. Vérifié sur un envoi réel : son champ `to` ne porte
  // que les adresses pour lesquelles IL a reçu (l'enveloppe) — dans le cas
  // « copie », le contact n'y figure pas du tout, et la contrepartie serait
  // introuvable. Le brut, lui, porte le `To:` complet ; à défaut, on retombe
  // sur ce que le fournisseur dit.
  const headers = raw ? parseRawMessage(raw) : null;
  const headerTo = headers ? extractEmails(firstHeader(headers, "to")) : [];
  const headerCc = headers ? extractEmails(firstHeader(headers, "cc")) : [];
  const parsed = parseInbound({
    subject: email.subject ?? "",
    text: email.text,
    html: email.html,
    fromEmail: senderEmail,
    fromName: null,
    to: headerTo.length > 0 ? headerTo : (email.to ?? []),
    cc: headerCc.length > 0 ? headerCc : (email.cc ?? []),
    emailDate: new Date(email.created_at ?? at),
    memberEmails,
    inboundDomain: domain,
  });
  const proposal = await proposeSignature({
    lines: parsed.signatureLines,
    phone: parsed.phone,
    phoneLabelled: parsed.phoneLabelled,
    senderName: parsed.counterpartName,
    senderEmail: parsed.counterpartEmail,
    lang: organization.defaultLocale === "en" ? "en" : "fr",
  });

  const stored = await insertInboundEmail({
    organizationId: organization.id,
    providerEmailId: notice.emailId,
    messageIdHeader,
    receivedAt: at,
    senderEmail,
    senderUserId: member.id,
    authResult: auth.result,
    authDetail: auth.detail,
    status: "pending",
    rejectionReason: null,
    mode: parsed.mode,
    subject: parsed.subject || (email.subject ?? null),
    counterpartEmail: parsed.counterpartEmail,
    counterpartName: proposal.name?.value ?? parsed.counterpartName,
    originalDate: parsed.occurredAt,
    proposal,
    // Le corps n'est conservé que si l'organisation l'a demandé — sinon NULL
    // dès la réception, pas seulement caché à l'écran (§4.3).
    bodyText: organization.storeInboundBodies ? parsed.originalBody.slice(0, 200_000) : null,
    sizeBytes,
  });
  if (!stored) return { outcome: "duplicate" };
  return { outcome: "stored", id: stored.id };
}
