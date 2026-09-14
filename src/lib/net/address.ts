/**
 * La CLASSIFICATION d'une adresse IP (chantier audit et production-ready,
 * étape 2, constat S6) : publique, ou pas. La veille va chercher des pages
 * et des flux à des adresses saisies par les membres ; sans ce filtre, la
 * fonction serverless pourrait être envoyée sonder le réseau interne du
 * fournisseur (métadonnées d'instance en 169.254.169.254, services en
 * 10.0.0.0/8…) et en rapporter des fragments comme « titres de flux ».
 *
 * Pure et sans réseau : elle classe une adresse déjà résolue. Les formes
 * lues : IPv4 décimale pointée, IPv6 complète ou abrégée (`::`), avec
 * IPv4 embarquée (`::ffff:10.0.0.1`, NAT64 `64:ff9b::…`, 6to4 `2002:…`),
 * crochets et identifiant de zone (`%eth0`) tolérés. Toute forme non
 * reconnue est NON publique : le doute ferme, jamais l'inverse.
 */

/** Une adresse IPv4 en quatre octets décimaux ; null pour toute autre écriture (hexadécimale, octale, à moins de quatre parties). */
export function parseIPv4(text: string): number[] | null {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets;
}

/** `octets` dans `prefix/bits` ? */
function inCidr4(octets: number[], prefix: string, bits: number): boolean {
  const p = parseIPv4(prefix)!;
  const value = ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
  const base = ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (value & mask) === (base & mask);
}

/** Les plages IPv4 qu'on ne sonde jamais : « cette machine », les réseaux privés, le lien local, les plages réservées et de documentation. */
const PRIVATE_V4: [string, number][] = [
  ["0.0.0.0", 8], // « cette machine »
  ["10.0.0.0", 8], // RFC 1918
  ["100.64.0.0", 10], // partage d'opérateur (RFC 6598)
  ["127.0.0.0", 8], // boucle locale
  ["169.254.0.0", 16], // lien local, dont les métadonnées d'instance 169.254.169.254
  ["172.16.0.0", 12], // RFC 1918
  ["192.0.0.0", 24], // protocoles IETF
  ["192.0.2.0", 24], // documentation (TEST-NET-1)
  ["192.168.0.0", 16], // RFC 1918
  ["198.18.0.0", 15], // bancs d'essai
  ["198.51.100.0", 24], // documentation (TEST-NET-2)
  ["203.0.113.0", 24], // documentation (TEST-NET-3)
  ["224.0.0.0", 4], // multidiffusion
  ["240.0.0.0", 4], // réservé, dont la diffusion 255.255.255.255
];

export function isPublicIPv4(octets: number[]): boolean {
  return !PRIVATE_V4.some(([prefix, bits]) => inCidr4(octets, prefix, bits));
}

/**
 * Une adresse IPv6 en huit groupes de 16 bits ; null si elle est illisible.
 * Gère l'abréviation `::` (une seule), l'IPv4 embarquée en queue
 * (`::ffff:192.0.2.1`) et l'identifiant de zone (`fe80::1%eth0`).
 */
export function parseIPv6(text: string): number[] | null {
  let raw = text;
  const zone = raw.indexOf("%");
  if (zone >= 0) raw = raw.slice(0, zone);
  if (!raw || /[^0-9a-fA-F:.]/.test(raw)) return null;

  // L'IPv4 en queue devient deux groupes de 16 bits.
  const lastColon = raw.lastIndexOf(":");
  const tail = raw.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIPv4(tail);
    if (!v4) return null;
    raw = `${raw.slice(0, lastColon + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }

  const halves = raw.split("::");
  if (halves.length > 2) return null;
  const readGroups = (part: string): number[] | null => {
    if (part === "") return [];
    const out: number[] = [];
    for (const group of part.split(":")) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
      out.push(parseInt(group, 16));
    }
    return out;
  };
  const head = readGroups(halves[0]);
  if (!head) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const rest = readGroups(halves[1]);
  if (!rest) return null;
  const missing = 8 - head.length - rest.length;
  if (missing < 1) return null;
  return [...head, ...new Array<number>(missing).fill(0), ...rest];
}

function v4Of(groups: number[], at: number): number[] {
  return [groups[at] >> 8, groups[at] & 0xff, groups[at + 1] >> 8, groups[at + 1] & 0xff];
}

export function isPublicIPv6(groups: number[]): boolean {
  const [g0, g1, g2, g3, g4, g5] = groups;
  const lowFour = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0;
  // ::/96 — :: (non spécifiée), ::1 (boucle locale) et les « IPv4-compatibles »
  // obsolètes (`::127.0.0.1`, `::7f00:1`) — et ::ffff:0:0:0/96 (« IPv4-translated »,
  // SIIT) : des formes qu'aucun réseau qu'on sonde ne route ; le doute ferme.
  if (lowFour && g4 === 0 && g5 === 0) return false;
  if (lowFour && g4 === 0xffff && g5 === 0) return false;
  // ::ffff:a.b.c.d — une IPv4 déguisée : c'est elle qu'on classe
  if (lowFour && g4 === 0 && g5 === 0xffff) return isPublicIPv4(v4Of(groups, 6));
  // 64:ff9b::/96 (NAT64) : l'IPv4 embarquée décide ; 64:ff9b:1::/48 est local
  if (g0 === 0x64 && g1 === 0xff9b) {
    if (g2 === 1) return false;
    if (g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return isPublicIPv4(v4Of(groups, 6));
  }
  // 2002::/16 (6to4) : l'IPv4 embarquée décide
  if (g0 === 0x2002) return isPublicIPv4(v4Of(groups, 1));
  // 100::/64 (trou noir), 2001:db8::/32 (documentation)
  if (g0 === 0x100 && g1 === 0 && g2 === 0 && g3 === 0) return false;
  if (g0 === 0x2001 && g1 === 0xdb8) return false;
  // fe80::/10 lien local, fec0::/10 site local (obsolète), fc00::/7 adresses locales uniques, ff00::/8 multidiffusion
  if ((g0 & 0xffc0) === 0xfe80) return false;
  if ((g0 & 0xffc0) === 0xfec0) return false;
  if ((g0 & 0xfe00) === 0xfc00) return false;
  if ((g0 & 0xff00) === 0xff00) return false;
  return true;
}

/**
 * LA question : cette adresse résolue est-elle publique ? Une IPv4, une
 * IPv6 (avec ou sans crochets), sinon non.
 */
export function isPublicAddress(address: string): boolean {
  const text = address.trim().replace(/^\[|\]$/g, "");
  const v4 = parseIPv4(text);
  if (v4) return isPublicIPv4(v4);
  const v6 = parseIPv6(text);
  if (v6) return isPublicIPv6(v6);
  return false;
}
