/**
 * LA LECTURE DU MESSAGE BRUT (docs/module-engagement.md §4.2) — juste ce
 * qu'il faut pour authentifier l'expéditeur : le bloc d'en-têtes tel quel
 * (DKIM signe le texte d'origine, pliages compris) et le corps tel quel.
 * Le contenu lisible (texte, HTML) vient de l'API du fournisseur, pas
 * d'ici : aucun décodage MIME de parties n'est fait dans ce module.
 */

export type RawHeader = {
  /** Le nom tel qu'écrit (« DKIM-Signature », « from »…). */
  name: string;
  /** La valeur dépliée (les CRLF de pliage retirés), sans l'espace de tête. */
  value: string;
  /** La ligne d'origine complète, nom + « : » + valeur pliée, SANS le CRLF final. */
  raw: string;
};

export type RawMessage = {
  headers: RawHeader[];
  /** Le corps brut, après la ligne vide, en CRLF. */
  body: string;
};

/** Ramène un message à des fins de ligne CRLF (le brut téléchargé peut avoir été normalisé en LF). */
export function normalizeCrlf(text: string): string {
  return text.replace(/\r?\n/g, "\r\n");
}

/**
 * ATTENTION : une chaîne passée ici doit être BINAIRE (un octet par
 * caractère, `latin1`/`binary`). Un brut décodé en UTF-8 ne peut plus être
 * ré-encodé octet pour octet, et sa signature DKIM échouerait faussement —
 * l'ingestion, elle, passe toujours le `Buffer` téléchargé.
 */
export function parseRawMessage(input: Buffer | string): RawMessage {
  // latin1 : un octet = un caractère, ce qui préserve le texte signé tel quel (DKIM hache des octets).
  const text = normalizeCrlf(typeof input === "string" ? input : input.toString("latin1"));
  const separator = text.indexOf("\r\n\r\n");
  const headerBlock = separator === -1 ? text : text.slice(0, separator);
  const body = separator === -1 ? "" : text.slice(separator + 4);

  const headers: RawHeader[] = [];
  const lines = headerBlock.split("\r\n");
  let current: string | null = null;
  const flush = () => {
    if (current === null) return;
    const colon = current.indexOf(":");
    if (colon > 0) {
      const name = current.slice(0, colon).trim();
      const value = current
        .slice(colon + 1)
        .replace(/\r\n/g, "")
        .replace(/^[ \t]+/, "");
      headers.push({ name, value, raw: current });
    }
    current = null;
  };
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && current !== null) {
      current += `\r\n${line}`;
    } else {
      flush();
      current = line;
    }
  }
  flush();
  return { headers, body };
}

/** Toutes les occurrences d'un en-tête, dans l'ordre du message. */
export function headersNamed(message: RawMessage, name: string): RawHeader[] {
  const wanted = name.toLowerCase();
  return message.headers.filter((h) => h.name.toLowerCase() === wanted);
}

/** La première occurrence (celle du haut, écrite par le dernier serveur) ou null. */
export function firstHeader(message: RawMessage, name: string): string | null {
  return headersNamed(message, name)[0]?.value ?? null;
}

/**
 * L'adresse d'une valeur d'en-tête (« Nom <a@b> », « a@b », « "Nom" <a@b> »).
 * Les chaînes entre guillemets sont retirées AVANT de chercher : un nom
 * d'affichage a le droit de contenir des chevrons, et
 * `"Marie <marie@cabinet.fr>" <pirate@mechant.fr>` doit rendre l'adresse
 * réelle — celle que le destinataire verra — et non celle que l'expéditeur
 * a écrite dans son nom pour se faire passer pour un membre.
 */
export function extractEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const withoutQuoted = value.replace(/"(?:[^"\\]|\\.)*"/g, " ");
  const angled = [...withoutQuoted.matchAll(/<([^<>\s]+@[^<>\s]+)>/g)].pop();
  const candidate = angled ? angled[1] : (withoutQuoted.match(/[^\s<>",;:]+@[^\s<>",;:]+/)?.[0] ?? null);
  if (!candidate) return null;
  const email = candidate.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

/** Le nom affiché devant une adresse (« Jean Testeur <j@x> » → « Jean Testeur »), sans guillemets ; null sinon. */
export function extractDisplayName(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(/^\s*("?)(.*?)\1\s*<[^<>]+>\s*$/);
  const name = match?.[2]?.trim().replace(/^"|"$/g, "").trim();
  return name ? decodeEncodedWords(name) : null;
}

/** Toutes les adresses d'une valeur d'en-tête (« a@b, Nom <c@d> »), en minuscules, dédoublonnées. */
export function extractEmails(value: string | null | undefined): string[] {
  if (!value) return [];
  const found = value.match(/[^\s<>",;:()]+@[^\s<>",;:()]+/g) ?? [];
  const out: string[] = [];
  for (const raw of found) {
    const email = raw.toLowerCase().replace(/\.+$/, "");
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && !out.includes(email)) out.push(email);
  }
  return out;
}

export function domainOf(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1).toLowerCase().replace(/\.$/, "");
}

/**
 * Les suffixes à DEUX labels sous lesquels chacun a son domaine : sans eux,
 * `attaquant.co.uk` et `client.co.uk` auraient le même domaine
 * organisationnel — donc seraient « alignés ». La liste publique des
 * suffixes (PSL) est hors de portée (zéro dépendance) : voici les cas
 * courants du périmètre, plus les domaines MUTUALISÉS où un sous-domaine
 * n'engage jamais son voisin (un tenant Microsoft, un compte SES).
 */
const TWO_LABEL_SUFFIXES = new Set([
  "co.uk", "org.uk", "me.uk", "ltd.uk", "plc.uk", "net.uk", "sch.uk", "ac.uk", "gov.uk",
  "com.au", "net.au", "org.au", "co.nz", "co.jp", "or.jp", "ne.jp", "com.br", "com.mx", "co.za", "com.sg", "com.hk",
  "asso.fr", "com.fr", "tm.fr", "nom.fr", "prd.fr", "gouv.fr", "co.in", "com.tr", "com.pl", "com.es", "com.pt", "com.ar",
  // Les sectoriels de l'AFNIC : le marché même du produit. Sans eux,
  // « pirate.avocat.fr » et « maitre.avocat.fr » auraient le même domaine
  // organisationnel — donc une signature DKIM du premier authentifierait un
  // From du second.
  "avocat.fr", "avoues.fr", "barreau.fr", "cci.fr", "chambagri.fr", "chirurgiens-dentistes.fr", "experts-comptables.fr",
  "geometre-expert.fr", "greta.fr", "huissier-justice.fr", "medecin.fr", "notaires.fr", "pharmacien.fr", "port.fr", "veterinaire.fr",
]);

/** Un sous-domaine y appartient à un client différent : jamais d'alignement entre deux voisins. */
const SHARED_TENANT_DOMAINS = new Set(["onmicrosoft.com", "amazonses.com", "appspot.com", "herokuapp.com", "vercel.app", "azurewebsites.net", "sharepoint.com", "myshopify.com"]);

/**
 * Le domaine organisationnel, approximé sans liste publique de suffixes
 * (choix assumé en §4.2) : les deux derniers labels, TROIS quand ces deux
 * derniers forment un suffixe connu (`client.co.uk`) ou un domaine
 * mutualisé (`cabinet.onmicrosoft.com`) — sans quoi deux clients d'un même
 * hébergeur passeraient pour la même organisation.
 */
export function organizationalDomain(domain: string): string {
  const labels = domain.toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  if (TWO_LABEL_SUFFIXES.has(lastTwo) || SHARED_TENANT_DOMAINS.has(lastTwo)) return labels.slice(-3).join(".");
  return lastTwo;
}

/** Alignement « relaxed » (RFC 7489) : même domaine, ou même domaine organisationnel. */
export function domainsAligned(a: string, b: string): boolean {
  const x = a.toLowerCase().replace(/\.$/, "");
  const y = b.toLowerCase().replace(/\.$/, "");
  return x === y || organizationalDomain(x) === organizationalDomain(y);
}

/** Décode les « encoded-words » RFC 2047 (« =?UTF-8?Q?Jean_Test=C3=A9?= ») d'un texte d'en-tête. */
export function decodeEncodedWords(text: string): string {
  // Le blanc qui SÉPARE deux mots encodés adjacents ne compte pas (RFC 2047
  // §6.2) : sans ça, « =?…?Q?Jean_?= =?…?Q?Test=C3=A9?= » rendait deux espaces.
  return text.replace(/(\?=)[ \t]*(?:\r?\n[ \t]+)?(=\?)/g, "$1$2").replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_whole, charset: string, encoding: string, payload: string) => {
    try {
      const bytes =
        encoding.toUpperCase() === "B"
          ? Buffer.from(payload, "base64")
          : Buffer.from(
              payload.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16))),
              "latin1"
            );
      const label = charset.toLowerCase().replace(/\*.*$/, "");
      return new TextDecoder(label === "utf8" ? "utf-8" : label).decode(bytes);
    } catch {
      return payload;
    }
  });
}
