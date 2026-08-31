import { createHash, createPublicKey, verify as cryptoVerify, type KeyObject } from "node:crypto";
import type { DnsResolver } from "./dns";
import { domainsAligned, headersNamed, type RawHeader, type RawMessage } from "./mime";

/**
 * LA VÉRIFICATION DKIM (RFC 6376) — calculée par nous, depuis le message
 * brut (docs/module-engagement.md §4.2, couche 3). Pour chaque en-tête
 * `DKIM-Signature` : canonicalisation du corps (`simple` ou `relaxed`),
 * hachage et comparaison avec `bh=`, canonicalisation des en-têtes listés
 * dans `h=` (du bas vers le haut, chaque occurrence consommée une fois),
 * clé publique par TXT `s._domainkey.d`, vérification RSA-SHA256 ou
 * Ed25519 de la signature `b=`. Aucun verdict n'est lu dans un en-tête
 * `Authentication-Results` — un expéditeur peut l'écrire lui-même.
 */

/** Les raisons d'échec, en codes (traduits à l'écran par `emails_recus.auth.dkim.<code>`). */
export type DkimFailureCode =
  | "bad_version"
  | "missing_tags"
  | "unsupported_algorithm"
  | "sha1_refused"
  | "expired"
  | "identity_mismatch"
  | "unknown_canonicalization"
  | "bad_length"
  | "length_limited"
  | "bad_expiration"
  | "duplicate_tag"
  | "body_hash_mismatch"
  | "from_not_signed"
  | "key_dns_unavailable"
  | "key_not_found"
  | "key_invalid"
  | "key_revoked"
  | "key_unsupported"
  | "key_mismatch"
  | "bad_signature"
  | "testing_key";

export type DkimSignatureResult = {
  domain: string | null;
  selector: string | null;
  /** `pass`, ou l'échec — avec son code précis, conservé dans `auth_detail`. */
  status: "pass" | "fail" | "temperror";
  code: DkimFailureCode | null;
  /** `d=` aligné avec le domaine du `From` (relaxed : même domaine organisationnel). */
  aligned: boolean;
};

const DKIM_SIGNATURE_HEADER = "dkim-signature";

type Tags = Record<string, string>;

/**
 * Les étiquettes d'une signature ou d'un enregistrement de clé. Une
 * étiquette RÉPÉTÉE rend la liste invalide (RFC 6376 §3.2) : la garder
 * silencieusement laisserait deux vérificateurs lire deux choses
 * différentes du même en-tête.
 */
function parseTags(value: string): { tags: Tags; duplicate: boolean } {
  const tags: Tags = {};
  let duplicate = false;
  for (const part of value.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    // Les espaces et pliages à l'intérieur d'une valeur (b=, bh=, h=) sont sans signification.
    const val = part
      .slice(eq + 1)
      .replace(/[\r\n]/g, "")
      .trim();
    if (!key) continue;
    if (key in tags) duplicate = true;
    else tags[key] = val;
  }
  return { tags, duplicate };
}

/* ---------- canonicalisation (RFC 6376 §3.4) ---------- */

function canonicalizeBodySimple(body: string): string {
  // Retire les lignes vides finales ; un corps sans CRLF final (ou vide) se termine par CRLF.
  const trimmed = body.replace(/(\r\n)*$/, "");
  return `${trimmed}\r\n`;
}

function canonicalizeBodyRelaxed(body: string): string {
  const lines = body.split("\r\n").map((line) => line.replace(/[ \t]+/g, " ").replace(/ $/, ""));
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  // Un corps vide reste vide (pas de CRLF) ; un corps non vide se termine par CRLF.
  return lines.length === 0 ? "" : `${lines.join("\r\n")}\r\n`;
}

function canonicalizeHeaderSimple(header: RawHeader): string {
  return header.raw;
}

function canonicalizeHeaderRelaxed(header: RawHeader): string {
  const colon = header.raw.indexOf(":");
  const name = header.raw.slice(0, colon).trim().toLowerCase();
  const value = header.raw
    .slice(colon + 1)
    .replace(/\r\n/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
  return `${name}:${value}`;
}

/* ---------- clés ---------- */

type DkimKey = { key: KeyObject; algorithm: "rsa" | "ed25519"; testing: boolean };

type KeyFailure = { code: DkimFailureCode; temporary?: boolean };

function parseKeyRecord(record: string): DkimKey | KeyFailure {
  const { tags, duplicate } = parseTags(record);
  if (duplicate) return { code: "key_invalid" };
  if (tags.v !== undefined && tags.v !== "DKIM1") return { code: "key_invalid" };
  const keyType = (tags.k ?? "rsa").toLowerCase();
  const p = (tags.p ?? "").replace(/\s+/g, "");
  if (!p) return { code: "key_revoked" };
  try {
    if (keyType === "rsa") {
      return { key: createPublicKey({ key: Buffer.from(p, "base64"), format: "der", type: "spki" }), algorithm: "rsa", testing: /(^|:)y(:|$)/.test(tags.t ?? "") };
    }
    if (keyType === "ed25519") {
      // La clé Ed25519 est publiée nue (32 octets) ; node veut un SPKI : on préfixe l'en-tête DER fixe.
      const rawKey = Buffer.from(p, "base64");
      if (rawKey.length !== 32) return { code: "key_invalid" };
      const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), rawKey]);
      return { key: createPublicKey({ key: spki, format: "der", type: "spki" }), algorithm: "ed25519", testing: /(^|:)y(:|$)/.test(tags.t ?? "") };
    }
    return { code: "key_unsupported" };
  } catch {
    return { code: "key_invalid" };
  }
}

async function fetchKey(resolver: DnsResolver, selector: string, domain: string): Promise<DkimKey | KeyFailure> {
  const name = `${selector}._domainkey.${domain}`;
  let records: string[];
  try {
    records = await resolver.txt(name);
  } catch {
    return { code: "key_dns_unavailable", temporary: true };
  }
  const candidates = records.filter((r) => /(^|;)\s*p=/.test(r) || /^v=DKIM1/i.test(r));
  if (candidates.length === 0) return { code: "key_not_found" };
  return parseKeyRecord(candidates[0]);
}

/* ---------- vérification d'une signature ---------- */

function selectSignedHeaders(message: RawMessage, names: string[], canonicalize: (h: RawHeader) => string): string[] {
  // Chaque nom de h= prend la DERNIÈRE occurrence non encore consommée (du bas vers le haut) ; un nom absent ne compte pas.
  const consumed = new Set<number>();
  const out: string[] = [];
  for (const name of names) {
    const wanted = name.trim().toLowerCase();
    if (!wanted) continue;
    for (let i = message.headers.length - 1; i >= 0; i--) {
      if (consumed.has(i) || message.headers[i].name.toLowerCase() !== wanted) continue;
      consumed.add(i);
      out.push(canonicalize(message.headers[i]));
      break;
    }
  }
  return out;
}

async function verifyOne(message: RawMessage, header: RawHeader, fromDomain: string, resolver: DnsResolver, now: Date): Promise<DkimSignatureResult> {
  const { tags, duplicate } = parseTags(header.value);
  const domain = tags.d?.toLowerCase() ?? null;
  const selector = tags.s ?? null;
  const aligned = domain !== null && domainsAligned(domain, fromDomain);
  const fail = (code: DkimFailureCode, status: "fail" | "temperror" = "fail"): DkimSignatureResult => ({ domain, selector, status, code, aligned });

  if (duplicate) return fail("duplicate_tag");
  if (tags.v !== "1") return fail("bad_version");
  if (!domain || !selector || !tags.b || !tags.bh || !tags.h) return fail("missing_tags");
  const algorithm = (tags.a ?? "").toLowerCase();
  if (algorithm === "rsa-sha1") return fail("sha1_refused"); // RFC 8301
  if (algorithm !== "rsa-sha256" && algorithm !== "ed25519-sha256") return fail("unsupported_algorithm");
  if (tags.x !== undefined) {
    // Une expiration illisible n'est pas une expiration absente : la sauter
    // laissait vivre indéfiniment une signature écrite pour expirer.
    if (!/^\d+$/.test(tags.x)) return fail("bad_expiration");
    if (Number(tags.x) < now.getTime() / 1000) return fail("expired");
  }
  if (tags.i) {
    const identityDomain = tags.i.slice(tags.i.lastIndexOf("@") + 1).toLowerCase();
    if (identityDomain !== domain && !identityDomain.endsWith(`.${domain}`)) return fail("identity_mismatch");
  }
  const [headerCanon = "simple", bodyCanon = "simple"] = (tags.c ?? "simple/simple").toLowerCase().split("/");
  if (!["simple", "relaxed"].includes(headerCanon) || !["simple", "relaxed"].includes(bodyCanon)) return fail("unknown_canonicalization");

  // 1. le corps
  let body = bodyCanon === "relaxed" ? canonicalizeBodyRelaxed(message.body) : canonicalizeBodySimple(message.body);
  if (tags.l !== undefined) {
    if (!/^\d+$/.test(tags.l)) return fail("bad_length");
    const limit = Number(tags.l);
    const size = Buffer.byteLength(body, "latin1");
    if (limit > size) return fail("bad_length");
    // RFC 6376 §8.2 : une signature qui ne couvre qu'un PRÉFIXE du corps
    // laisse ajouter du texte non signé sous un verdict « pass » (« voici le
    // compte rendu » + « virement urgent sur ce compte »). On la refuse, comme
    // les vérificateurs modernes — jamais un « pass » sur un corps tronqué.
    if (limit < size) return fail("length_limited");
    body = Buffer.from(body, "latin1").subarray(0, limit).toString("latin1");
  }
  const bodyHash = createHash("sha256").update(Buffer.from(body, "latin1")).digest("base64");
  if (bodyHash !== tags.bh.replace(/\s+/g, "")) return fail("body_hash_mismatch");

  // 2. les en-têtes signés + la signature elle-même, b= vidé, sans CRLF final
  const canonicalize = headerCanon === "relaxed" ? canonicalizeHeaderRelaxed : canonicalizeHeaderSimple;
  const signed = selectSignedHeaders(message, tags.h.split(":"), canonicalize);
  if (!tags.h.split(":").some((n) => n.trim().toLowerCase() === "from")) return fail("from_not_signed");
  // Le retrait de `b=` doit tolérer les blancs autorisés autour du signe égal
  // (RFC 6376 §3.2 : « b = <base64> » est légal) — et ne jamais attraper `bh=`
  // (l'ancre exige un début de champ ou un « ; » avant le « b »).
  const stripped: RawHeader = { ...header, raw: header.raw.replace(/(^|;)(\s*b\s*=)[^;]*/, "$1$2") };
  const data = Buffer.from(`${signed.map((h) => `${h}\r\n`).join("")}${canonicalize(stripped)}`, "latin1");

  // 3. la clé et la signature
  const key = await fetchKey(resolver, selector, domain);
  if ("code" in key) return fail(key.code, key.temporary ? "temperror" : "fail");
  if ((algorithm === "rsa-sha256" && key.algorithm !== "rsa") || (algorithm === "ed25519-sha256" && key.algorithm !== "ed25519")) return fail("key_mismatch");
  let ok = false;
  try {
    const signature = Buffer.from(tags.b.replace(/\s+/g, ""), "base64");
    ok = key.algorithm === "rsa" ? cryptoVerify("sha256", data, key.key, signature) : cryptoVerify(null, data, key.key, signature);
  } catch {
    ok = false;
  }
  if (!ok) return fail("bad_signature");
  if (key.testing) return fail("testing_key");
  return { domain, selector, status: "pass", code: null, aligned };
}

/** Vérifie toutes les signatures du message ; l'ordre du message est conservé. */
export async function verifyDkim(message: RawMessage, fromDomain: string, resolver: DnsResolver, now: Date = new Date()): Promise<DkimSignatureResult[]> {
  const signatures = headersNamed(message, DKIM_SIGNATURE_HEADER);
  const results: DkimSignatureResult[] = [];
  for (const header of signatures.slice(0, 10)) results.push(await verifyOne(message, header, fromDomain, resolver, now));
  return results;
}
