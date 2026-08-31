import { systemResolver, type DnsResolver } from "./dns";
import { verifyDkim, type DkimSignatureResult } from "./dkim";
import { domainOf, domainsAligned, extractEmail, headersNamed, parseRawMessage, type RawMessage } from "./mime";
import { evaluateSpf, type SpfOutcome } from "./spf";

/**
 * L'AUTHENTIFICATION DE L'EXPÉDITEUR d'un email reçu (docs/module-engagement.md
 * §4.2, couche 3) : DKIM aligné d'abord ; à défaut SPF `pass` avec un
 * `Return-Path` aligné sur le `From` ; sinon `failed`. `unavailable` quand
 * le message brut n'a pas pu être lu. Le verdict et sa preuve (domaine
 * signataire, sélecteur, adresse IP, domaine SPF, codes d'échec) sont
 * rendus pour être conservés dans `inbound_emails.auth_result` /
 * `auth_detail` — des codes, traduits à l'écran, jamais des phrases.
 */

export type AuthResult = "dkim_aligned" | "spf_aligned" | "failed" | "unavailable";

export type SpfDetail = SpfOutcome & {
  ip: string | null;
  /** Le domaine évalué (celui du Return-Path) ; null s'il n'y avait rien à évaluer. */
  domain: string | null;
  returnPath: string | null;
  aligned: boolean;
  /**
   * Pourquoi SPF n'a pas pu être évalué : aucune IP de connexion lisible,
   * aucun `Return-Path` posé par le récepteur, ou — à surveiller — un
   * premier `Received` que nous ne reconnaissons pas comme celui du
   * fournisseur (il a changé d'hôte ou de route : la couche SPF
   * disparaîtrait alors en silence).
   */
  skipped: "no_ip" | "no_return_path" | "receiver_not_recognized" | null;
};

export type AuthDetail = {
  fromDomain: string | null;
  dkim: DkimSignatureResult[];
  spf: SpfDetail | null;
};

const RECEIVED_HEADER = "received";
const RETURN_PATH_HEADER = "return-path";

/** Le serveur de réception du fournisseur : le seul `Received` digne de foi (les autres, un expéditeur peut les écrire). */
const RECEIVER_PATTERN = /\bby\s+inbound-smtp\.[a-z0-9-]+\.amazonaws\.com\b/i;

/**
 * L'adresse IP de connexion, lue dans le PREMIER en-tête `Received` — celui
 * écrit par le serveur de réception du fournisseur.
 *
 * PIÈGE, corrigé ici : la ligne commence par le HELO annoncé par le CLIENT
 * (`from <helo>`), et un HELO a parfaitement le droit d'être un littéral
 * d'adresse (`from [209.85.128.1]`, RFC 5321 §4.1.3). Prendre le premier
 * `[...]` de la ligne, c'est donc lire une adresse CHOISIE PAR
 * L'EXPÉDITEUR : il lui suffisait d'annoncer une IP autorisée par le SPF du
 * domaine usurpé pour passer la couche 3. On retire donc le jeton HELO
 * avant de chercher, et l'IP n'est retenue que dans la clause écrite par le
 * récepteur — « (rdns [1.2.3.4]) ». Sans cette clause : pas d'IP, donc pas
 * de SPF, jamais une IP glanée ailleurs.
 */
export function connectingIp(message: RawMessage, receiverPattern: RegExp = RECEIVER_PATTERN): { ip: string | null; helo: string | null; receiverKnown: boolean } {
  const first = headersNamed(message, RECEIVED_HEADER)[0]?.value ?? null;
  if (!first || !receiverPattern.test(first)) return { ip: null, helo: null, receiverKnown: false };
  const helo = first.match(/^\s*from\s+(\[?[^\s(]+)/i)?.[1] ?? null;
  const afterHelo = first.replace(/^\s*from\s+\[?[^\s(]+\]?/i, "");
  // La clause du récepteur : « (nom [1.2.3.4]) », « (unknown [2a00:…]) », « ([IPv6:2a00:…]) ».
  const clause = afterHelo.match(/\((?:[^()]*?\s)?\[?(?:IPv6:)?([0-9a-fA-F.:]+)\]?\)/);
  const ip = clause?.[1] ?? null;
  return { ip: ip && /[.:]/.test(ip) ? ip : null, helo, receiverKnown: true };
}

export async function authenticateSender(
  raw: Buffer | string | null,
  fromEmail: string,
  options: { resolver?: DnsResolver; now?: Date } = {}
): Promise<{ result: AuthResult; detail: AuthDetail }> {
  const resolver = options.resolver ?? systemResolver;
  const fromDomain = domainOf(fromEmail);
  if (raw === null || raw.length === 0) {
    return { result: "unavailable", detail: { fromDomain, dkim: [], spf: null } };
  }
  const message = parseRawMessage(raw);

  // 1. DKIM — une signature valide ET alignée suffit.
  const dkim = await verifyDkim(message, fromDomain, resolver, options.now);
  if (dkim.some((s) => s.status === "pass" && s.aligned)) {
    return { result: "dkim_aligned", detail: { fromDomain, dkim, spf: null } };
  }

  // 2. SPF — l'IP de connexion contre le domaine du Return-Path, qui doit être aligné.
  const { ip, helo, receiverKnown } = connectingIp(message);
  const returnPath = trustedReturnPath(message);
  const spfDomain = returnPath ? domainOf(returnPath) : null;
  let spf: SpfDetail;
  if (ip && spfDomain && returnPath) {
    const outcome = await evaluateSpf({ ip, domain: spfDomain, sender: returnPath, helo: helo ?? undefined, resolver });
    const aligned = domainsAligned(spfDomain, fromDomain);
    spf = { ...outcome, ip, domain: spfDomain, returnPath, aligned, skipped: null };
    if (outcome.result === "pass" && aligned) return { result: "spf_aligned", detail: { fromDomain, dkim, spf } };
  } else {
    spf = {
      result: "none",
      code: null,
      lookups: 0,
      ip,
      domain: spfDomain,
      returnPath,
      aligned: false,
      skipped: !receiverKnown ? "receiver_not_recognized" : ip ? "no_return_path" : "no_ip",
    };
  }

  // « On n'a pas pu vérifier » n'est pas « la vérification a échoué » : une
  // panne DNS (résolution indisponible, quota) ne doit pas ressembler à une
  // usurpation. Les deux restent des REFUS (§4.2 : jamais d'acceptation par
  // défaut), mais l'écran dit lequel des deux, et un `unavailable` se rejoue.
  const temporary = dkim.some((s) => s.status === "temperror") || spf.result === "temperror";
  return { result: temporary ? "unavailable" : "failed", detail: { fromDomain, dkim, spf } };
}

/**
 * Le `Return-Path` DIGNE DE FOI : celui posé par le serveur de réception,
 * donc AU-DESSUS de son propre `Received`. Un message forgé peut porter sa
 * propre ligne `Return-Path:` — la croire, c'est laisser l'expéditeur
 * choisir le domaine dont le SPF sera évalué.
 */
function trustedReturnPath(message: RawMessage): string | null {
  const receiverIndex = message.headers.findIndex((h) => h.name.toLowerCase() === RECEIVED_HEADER && RECEIVER_PATTERN.test(h.value));
  const returnIndex = message.headers.findIndex((h) => h.name.toLowerCase() === RETURN_PATH_HEADER);
  if (returnIndex === -1) return null;
  if (receiverIndex === -1 || returnIndex > receiverIndex) return null;
  return extractEmail(message.headers[returnIndex].value);
}
