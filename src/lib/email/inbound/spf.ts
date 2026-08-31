import { DnsTemporaryError, type DnsResolver } from "./dns";

/**
 * L'ÉVALUATION SPF (RFC 7208) — calculée par nous depuis l'adresse IP de
 * connexion et le domaine du `Return-Path` (docs/module-engagement.md §4.2,
 * couche 3, à défaut d'une signature DKIM alignée). Mécanismes `all`, `ip4`,
 * `ip6`, `a`, `mx`, `include`, `exists` (avec macros de base), `ptr`
 * (jamais un match — le protocole le déconseille), modificateur
 * `redirect`. Dix requêtes DNS au plus, sinon `permerror`. Seul `pass`
 * vaut authentification.
 */

export type SpfResult = "pass" | "fail" | "softfail" | "neutral" | "none" | "temperror" | "permerror";

/** Les codes d'erreur, traduits à l'écran (`emails_recus.auth.spf.<code>`). */
export type SpfErrorCode =
  | "invalid_ip"
  | "too_many_lookups"
  | "too_many_voids"
  | "duplicate_modifier"
  | "multiple_records"
  | "invalid_domain"
  | "invalid_term"
  | "invalid_prefix"
  | "invalid_ip4"
  | "invalid_ip6"
  | "unknown_mechanism"
  | "include_invalid"
  | "redirect_none"
  | "too_many_mx"
  | "too_deep"
  | "dns_unavailable"
  | "unexpected";

export type SpfOutcome = { result: SpfResult; code: SpfErrorCode | null; lookups: number };

class SpfPermError extends Error {
  readonly code: SpfErrorCode;
  constructor(code: SpfErrorCode) {
    super(code);
    this.code = code;
  }
}
class SpfTempError extends Error {
  readonly code: SpfErrorCode;
  constructor(code: SpfErrorCode) {
    super(code);
    this.code = code;
  }
}

type Ip = { family: 4 | 6; bytes: number[] };

export function parseIp(text: string): Ip | null {
  const value = text.trim();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) {
    const bytes = value.split(".").map(Number);
    return bytes.every((b) => b <= 255) ? { family: 4, bytes } : null;
  }
  if (value.includes(":")) {
    const parsed = parseIpv6(value);
    // « ::ffff:203.0.113.7 » EST une adresse IPv4 : la laisser en famille 6
    // interdisait tout `ip4:` de correspondre — un refus silencieux.
    if (parsed && parsed.bytes.slice(0, 10).every((b) => b === 0) && parsed.bytes[10] === 0xff && parsed.bytes[11] === 0xff) {
      return { family: 4, bytes: parsed.bytes.slice(12) };
    }
    return parsed;
  }
  return null;
}

function parseIpv6(text: string): Ip | null {
  let value = text.toLowerCase();
  // Forme mixte « ::ffff:1.2.3.4 » : on convertit la queue IPv4 en deux groupes hexadécimaux.
  const mixed = value.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mixed) {
    const v4 = parseIp(mixed[2]);
    if (!v4) return null;
    value = `${mixed[1]}${((v4.bytes[0] << 8) | v4.bytes[1]).toString(16)}:${((v4.bytes[2] << 8) | v4.bytes[3]).toString(16)}`;
  }
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = [...head, ...Array<string>(missing).fill("0"), ...tail];
  const bytes: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
    const n = parseInt(group, 16);
    bytes.push(n >> 8, n & 0xff);
  }
  return { family: 6, bytes };
}

function ipInCidr(ip: Ip, network: Ip, prefix: number): boolean {
  if (ip.family !== network.family) return false;
  const max = ip.family === 4 ? 32 : 128;
  const bits = Math.min(Math.max(prefix, 0), max);
  for (let i = 0; i < bits; i++) {
    const byte = i >> 3;
    const mask = 0x80 >> (i & 7);
    if ((ip.bytes[byte] & mask) !== (network.bytes[byte] & mask)) return false;
  }
  return true;
}

function ipToString(ip: Ip): string {
  if (ip.family === 4) return ip.bytes.join(".");
  const groups: string[] = [];
  for (let i = 0; i < 16; i += 2) groups.push(((ip.bytes[i] << 8) | ip.bytes[i + 1]).toString(16));
  return groups.join(":");
}

/* ---------- macros (RFC 7208 §7), le sous-ensemble courant ---------- */

type MacroContext = { sender: string; domain: string; ip: Ip; helo: string };

function expandMacros(spec: string, ctx: MacroContext): string {
  // `p` (le nom inverse) n'est pas géré : le laisser dans la classe le
  // rendait littéral au lieu d'être une erreur de syntaxe.
  return spec.replace(/%\{([slodivh])(\d*)(r?)([.\-+,/_=]*)\}|%%|%_|%-/gi, (whole, letter: string | undefined, digits: string, reverse: string, delimiters: string) => {
    if (whole === "%%") return "%";
    if (whole === "%_") return " ";
    if (whole === "%-") return "%20";
    if (!letter) return whole;
    let value: string;
    switch (letter.toLowerCase()) {
      case "s":
        value = ctx.sender;
        break;
      case "l":
        value = ctx.sender.slice(0, ctx.sender.lastIndexOf("@"));
        break;
      case "o":
        value = ctx.sender.slice(ctx.sender.lastIndexOf("@") + 1);
        break;
      case "d":
        value = ctx.domain;
        break;
      case "i":
        value = ctx.ip.family === 4 ? ipToString(ctx.ip) : ctx.ip.bytes.flatMap((b) => [(b >> 4).toString(16), (b & 15).toString(16)]).join(".");
        break;
      case "v":
        value = ctx.ip.family === 4 ? "in-addr" : "ip6";
        break;
      case "h":
        value = ctx.helo;
        break;
      default:
        return whole;
    }
    const splitOn = delimiters ? new RegExp(`[${delimiters.replace(/[-\]\\^]/g, "\\$&")}]`) : /\./;
    let parts = value.split(splitOn);
    if (reverse) parts = parts.reverse();
    if (digits) {
      // « %{d0} » : le protocole exige un chiffre non nul (RFC 7208 §7.1).
      if (digits === "0" || /^0/.test(digits)) throw new SpfPermError("invalid_term");
      parts = parts.slice(-Number(digits));
    }
    const expanded = parts.join(".");
    // Une macro en MAJUSCULE est développée puis échappée (§7.3).
    return letter === letter.toUpperCase() ? encodeURIComponent(expanded) : expanded;
  });
}

/* ---------- l'évaluation ---------- */

type Evaluation = { lookups: number; voids: number; resolver: DnsResolver; ctx: MacroContext };

/**
 * Une requête DNS. Elle ne compte PAS dans les dix : la limite du protocole
 * (§4.6.4) porte sur les TERMES qui en déclenchent une — include, a, mx,
 * ptr, exists, redirect — et non sur la lecture de l'enregistrement du
 * domaine évalué. La compter faisait échouer un enregistrement de dix
 * termes, pourtant exactement à la limite. Une réponse VIDE, elle, est
 * comptée : deux au plus, c'est le garde-fou d'amplification du protocole.
 */
async function query<T>(ev: Evaluation, run: () => Promise<T[]>): Promise<T[]> {
  let result: T[];
  try {
    result = await run();
  } catch (error) {
    if (error instanceof DnsTemporaryError) throw new SpfTempError("dns_unavailable");
    throw error;
  }
  if (result.length === 0) {
    ev.voids += 1;
    if (ev.voids > 2) throw new SpfPermError("too_many_voids");
  }
  return result;
}

/** Un terme qui déclenche une requête : dix au plus dans toute l'évaluation. */
function countTerm(ev: Evaluation): void {
  ev.lookups += 1;
  if (ev.lookups > 10) throw new SpfPermError("too_many_lookups");
}

async function fetchRecord(ev: Evaluation, domain: string): Promise<string | null> {
  const records = await query(ev, () => ev.resolver.txt(domain));
  const spf = records.filter((r) => /^v=spf1(\s|$)/i.test(r));
  if (spf.length === 0) return null;
  if (spf.length > 1) throw new SpfPermError("multiple_records");
  return spf[0];
}

async function addressesOf(ev: Evaluation, name: string, family: 4 | 6): Promise<Ip[]> {
  const list = await query(ev, () => (family === 4 ? ev.resolver.a(name) : ev.resolver.aaaa(name)));
  return list.map(parseIp).filter((ip): ip is Ip => ip !== null);
}

async function hostMatches(ev: Evaluation, name: string, cidr4: number, cidr6: number): Promise<boolean> {
  const ip = ev.ctx.ip;
  const addresses = await addressesOf(ev, name, ip.family);
  return addresses.some((a) => ipInCidr(ip, a, ip.family === 4 ? cidr4 : cidr6));
}

function parseCidr(suffix: string): { cidr4: number; cidr6: number } {
  // « /24 », « //64 », « /24//64 » — hors bornes, l'enregistrement est
  // syntaxiquement faux (§5.6) : un « /99 » raboté à /32 aurait fait passer
  // pour valide un enregistrement que personne d'autre ne lit pareil.
  const match = suffix.match(/^(?:\/(\d{1,3}))?(?:\/\/(\d{1,3}))?$/);
  if (!match) throw new SpfPermError("invalid_prefix");
  const cidr4 = match[1] !== undefined ? Number(match[1]) : 32;
  const cidr6 = match[2] !== undefined ? Number(match[2]) : 128;
  if (cidr4 > 32 || cidr6 > 128) throw new SpfPermError("invalid_prefix");
  return { cidr4, cidr6 };
}

async function checkHost(ev: Evaluation, domain: string, depth: number): Promise<SpfResult> {
  if (depth > 10) throw new SpfPermError("too_deep");
  // Un nom malformé rend « none », pas une erreur permanente (§4.3) : c'est
  // un fait sur le domaine, et la table du §5.2 en fera un permerror là où
  // il le faut (dans un `include:`).
  const labels = domain.split(".");
  if (!/^[a-z0-9_.-]+$/i.test(domain) || domain.length > 253 || labels.some((l, i) => l.length > 63 || (l.length === 0 && i < labels.length - 1))) return "none";
  const record = await fetchRecord(ev, domain);
  if (record === null) return "none";

  const terms = record.split(/\s+/).slice(1).filter(Boolean);
  let redirect: string | null = null;
  const seenModifiers = new Set<string>();
  const ctx = { ...ev.ctx, domain };

  for (const term of terms) {
    const modifier = term.match(/^([a-z][a-z0-9_.-]*)=(.*)$/i);
    if (modifier) {
      const name = modifier[1].toLowerCase();
      // `redirect` et `exp` au plus une fois (§6) : répétés, deux
      // vérificateurs ne liraient pas le même enregistrement.
      if ((name === "redirect" || name === "exp") && seenModifiers.has(name)) throw new SpfPermError("duplicate_modifier");
      seenModifiers.add(name);
      if (name === "redirect") redirect = expandMacros(modifier[2], ctx);
      continue; // exp= et les modificateurs inconnus sont ignorés (RFC 7208 §6)
    }
    const mech = term.match(/^([+\-~?]?)([a-z0-9]+)(?::([^/]*))?((?:\/\/?\d{1,3})*)$/i);
    if (!mech) throw new SpfPermError("invalid_term");
    const qualifier = mech[1] || "+";
    const name = mech[2].toLowerCase();
    const argument = mech[3];
    const suffix = mech[4] ?? "";
    // « a: » ou « include: » sans nom, « all:x » : des erreurs de syntaxe
    // (§5.1, §5.3-5.5), pas des mécanismes à interpréter au mieux.
    if (argument === "") throw new SpfPermError("invalid_term");
    if (name === "all" && (argument !== undefined || suffix)) throw new SpfPermError("invalid_term");
    let matched = false;
    switch (name) {
      case "all":
        matched = true;
        break;
      case "ip4": {
        // L'adresse est dans l'argument, le préfixe (« /18 ») dans le suffixe.
        const network = argument ? parseIp(argument) : null;
        const prefix = suffix.match(/^\/(\d{1,3})$/);
        const bits = prefix ? Number(prefix[1]) : 32;
        // Un « /99 » n'est pas un réseau : le raboter à /32 aurait fait passer
        // pour valide un enregistrement que personne d'autre ne lit pareil.
        if (!network || network.family !== 4 || (suffix && !prefix) || bits > 32) throw new SpfPermError("invalid_ip4");
        matched = ipInCidr(ctx.ip, network, bits);
        break;
      }
      case "ip6": {
        const network = argument ? parseIp(argument) : null;
        const prefix = suffix.match(/^\/(\d{1,3})$/);
        const bits = prefix ? Number(prefix[1]) : 128;
        if (!network || network.family !== 6 || (suffix && !prefix) || bits > 128) throw new SpfPermError("invalid_ip6");
        matched = ipInCidr(ctx.ip, network, bits);
        break;
      }
      case "a": {
        const { cidr4, cidr6 } = parseCidr(suffix);
        const target = argument ? expandMacros(argument, ctx) : domain;
        countTerm(ev);
        matched = await hostMatches(ev, target, cidr4, cidr6);
        break;
      }
      case "mx": {
        const { cidr4, cidr6 } = parseCidr(suffix);
        const target = argument ? expandMacros(argument, ctx) : domain;
        countTerm(ev);
        const exchanges = await query(ev, () => ev.resolver.mx(target));
        if (exchanges.length > 10) throw new SpfPermError("too_many_mx");
        for (const exchange of exchanges) {
          if (await hostMatches(ev, exchange, cidr4, cidr6)) {
            matched = true;
            break;
          }
        }
        break;
      }
      case "include": {
        if (!argument) throw new SpfPermError("include_invalid");
        countTerm(ev);
        const inner = await checkHost(ev, expandMacros(argument, ctx), depth + 1);
        if (inner === "pass") matched = true;
        else if (inner === "temperror") throw new SpfTempError("dns_unavailable");
        else if (inner === "permerror" || inner === "none") throw new SpfPermError("include_invalid");
        break;
      }
      case "exists": {
        if (!argument) throw new SpfPermError("invalid_term");
        const target = expandMacros(argument, ctx);
        countTerm(ev);
        matched = (await query(ev, () => ev.resolver.a(target))).length > 0;
        break;
      }
      case "ptr":
        // Déconseillé par le protocole (§5.5) : compte une requête, ne correspond jamais.
        countTerm(ev);
        matched = false;
        break;
      default:
        throw new SpfPermError("unknown_mechanism");
    }
    if (matched) {
      if (qualifier === "+") return "pass";
      if (qualifier === "-") return "fail";
      if (qualifier === "~") return "softfail";
      return "neutral";
    }
  }
  if (redirect) {
    countTerm(ev);
    const inner = await checkHost(ev, redirect, depth + 1);
    if (inner === "none") throw new SpfPermError("redirect_none");
    return inner;
  }
  return "neutral";
}

/**
 * `check_host(ip, domain, sender)` du protocole. `sender` = l'adresse du
 * `Return-Path` (ou `postmaster@domaine` s'il est vide) ; `helo` sert aux
 * macros seulement.
 */
export async function evaluateSpf(args: { ip: string; domain: string; sender: string; helo?: string; resolver: DnsResolver }): Promise<SpfOutcome> {
  const ip = parseIp(args.ip);
  if (!ip) return { result: "permerror", code: "invalid_ip", lookups: 0 };
  const ev: Evaluation = { lookups: 0, voids: 0, resolver: args.resolver, ctx: { sender: args.sender, domain: args.domain, ip, helo: args.helo ?? args.domain } };
  try {
    const result = await checkHost(ev, args.domain.toLowerCase(), 0);
    return { result, code: null, lookups: ev.lookups };
  } catch (error) {
    if (error instanceof SpfTempError) return { result: "temperror", code: error.code, lookups: ev.lookups };
    if (error instanceof SpfPermError) return { result: "permerror", code: error.code, lookups: ev.lookups };
    return { result: "temperror", code: "unexpected", lookups: ev.lookups };
  }
}
