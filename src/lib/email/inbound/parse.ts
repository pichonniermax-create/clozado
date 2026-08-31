import { decodeEncodedWords, domainOf, extractDisplayName, extractEmail } from "./mime";

/**
 * LE PARSEUR DÉTERMINISTE d'un email ingéré (docs/module-engagement.md §4.3)
 * — il ne devine rien : transfert ou copie, la contrepartie, la date
 * d'origine, les lignes de signature, un téléphone par motif. Tout ce qui
 * relève du jugement (nom, société, fonction dans la signature) est laissé
 * au modèle (`signature.ts`), puis à la personne qui confirme. Le contenu
 * est du texte non fiable : jamais interprété, seulement découpé.
 */

export type ForwardedBlock = {
  /** L'expéditeur d'origine, tel qu'écrit dans le bloc (« Nom <a@b> »). */
  fromRaw: string | null;
  email: string | null;
  name: string | null;
  date: Date | null;
  subject: string | null;
  /** Le corps d'origine : ce qui suit le bloc d'en-têtes transféré. */
  body: string;
};

export type ParsedInbound = {
  mode: "forward" | "copy" | null;
  counterpartEmail: string | null;
  counterpartName: string | null;
  /** La date de l'interaction : celle du bloc transféré, sinon celle de l'email. */
  occurredAt: Date;
  /** L'objet de l'interaction : l'objet d'origine sans ses préfixes. */
  subject: string;
  /** Le texte sur lequel chercher la signature (le message d'origine pour un transfert). */
  originalBody: string;
  signatureLines: string[];
  phone: string | null;
  /** Le téléphone était ANNONCÉ (« Tél. … ») ou portait un indicatif : sinon c'est une forme, à vérifier. */
  phoneLabelled: boolean;
};

/* ---------- HTML → texte ---------- */

/** Les entités nommées HTML 4 (Latin-1 complet, ponctuation typographique, symboles usuels). */
const NAMED_ENTITIES: Record<string, string> = Object.fromEntries(
  (
    "amp:& lt:< gt:> quot:\" apos:' nbsp:  iexcl:¡ cent:¢ pound:£ curren:¤ yen:¥ brvbar:¦ sect:§ uml:¨ copy:© ordf:ª laquo:« not:¬ shy:\u00ad reg:® macr:¯ deg:° " +
    "plusmn:± sup2:² sup3:³ acute:´ micro:µ para:¶ middot:· cedil:¸ sup1:¹ ordm:º raquo:» frac14:¼ frac12:½ frac34:¾ iquest:¿ " +
    "Agrave:À Aacute:Á Acirc:Â Atilde:Ã Auml:Ä Aring:Å AElig:Æ Ccedil:Ç Egrave:È Eacute:É Ecirc:Ê Euml:Ë Igrave:Ì Iacute:Í Icirc:Î Iuml:Ï " +
    "ETH:Ð Ntilde:Ñ Ograve:Ò Oacute:Ó Ocirc:Ô Otilde:Õ Ouml:Ö times:× Oslash:Ø Ugrave:Ù Uacute:Ú Ucirc:Û Uuml:Ü Yacute:Ý THORN:Þ szlig:ß " +
    "agrave:à aacute:á acirc:â atilde:ã auml:ä aring:å aelig:æ ccedil:ç egrave:è eacute:é ecirc:ê euml:ë igrave:ì iacute:í icirc:î iuml:ï " +
    "eth:ð ntilde:ñ ograve:ò oacute:ó ocirc:ô otilde:õ ouml:ö divide:÷ oslash:ø ugrave:ù uacute:ú ucirc:û uuml:ü yacute:ý thorn:þ yuml:ÿ " +
    "OElig:Œ oelig:œ Scaron:Š scaron:š Yuml:Ÿ fnof:ƒ circ:ˆ tilde:˜ ensp:\u2002 emsp:\u2003 thinsp:\u2009 zwnj:\u200c zwj:\u200d lrm:\u200e rlm:\u200f " +
    "ndash:– mdash:— lsquo:‘ rsquo:’ sbquo:‚ ldquo:“ rdquo:” bdquo:„ dagger:† Dagger:‡ bull:• hellip:… permil:‰ prime:′ Prime:″ lsaquo:‹ rsaquo:› " +
    "oline:‾ euro:€ trade:™ larr:← uarr:↑ rarr:→ darr:↓ harr:↔ minus:− lowast:∗ radic:√ infin:∞ ne:≠ le:≤ ge:≥ hearts:♥ diams:♦"
  )
    .split(" ")
    .map((pair) => [pair.slice(0, pair.indexOf(":")), pair.slice(pair.indexOf(":") + 1)])
);

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[entity] ?? NAMED_ENTITIES[entity.toLowerCase()] ?? whole;
  });
}

/** Un HTML d'email rendu en texte : balises retirées (jamais interprétées), sauts conservés, entités décodées. */
export function htmlToText(html: string): string {
  const withoutBlocks = html
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1\s*>/gi, "")
    // Une balise de bloc jamais refermée (un HTML d'email mal formé) : sans
    // ça, tout le CSS ou le JavaScript se retrouvait dans le texte conservé.
    .replace(/<(script|style|head)\b[\s\S]*$/i, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  const withBreaks = withoutBlocks
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote|pre|table|section|article|header|footer)\s*>/gi, "\n")
    .replace(/<(p|div|tr|li|h[1-6]|blockquote|pre|table|section|article|header|footer)\b[^>]*>/gi, "\n")
    .replace(/<\/t[dh]\s*>/gi, "\t");
  // Le dépouillement saute les attributs entre guillemets : un `title="a > b"`
  // arrêtait le motif au mauvais « > » et laissait du balisage dans le texte.
  const stripped = withBreaks.replace(/<[a-zA-Z!/][^>"']*(?:"[^"]*"|'[^']*')*[^>]*>/g, "").replace(/<[^>]*>/g, "");
  return normalizeText(decodeEntities(stripped));
}

/** Espaces insécables → espaces, fins de ligne CRLF → LF, lignes purgées de leurs espaces finaux, trois sauts au plus. */
export function normalizeText(text: string): string {
  return text
    .replace(/ /g, " ")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ---------- transfert ---------- */

// Les préfixes de TRANSFERT réellement écrits par les clients de messagerie
// visés (§4.3) — pas de préfixe d'une seule lettre : « i: relance » n'est
// pas un transfert, et le prendre pour tel verrouille toute la
// classification (un objet ainsi préfixé ne peut plus être une copie).
const FORWARD_SUBJECT = /^\s*(?:(?:fwd?|tr|wg)\s*:\s*)+/i;
const REPLY_SUBJECT = /^\s*(?:(?:re|aw|sv)\s*:\s*)+/i;

/** L'objet sans ses préfixes de transfert et de réponse (« Fwd: TR: Re: Devis » → « Devis »). */
export function cleanSubject(subject: string): string {
  let out = subject.trim();
  for (let i = 0; i < 6; i++) {
    const next = out.replace(FORWARD_SUBJECT, "").replace(REPLY_SUBJECT, "").trim();
    if (next === out) break;
    out = next;
  }
  return out;
}

export function isForwardSubject(subject: string): boolean {
  return FORWARD_SUBJECT.test(subject);
}

/** Les séparateurs de TRANSFERT (§4.3) : Gmail, Apple Mail, Outlook, Thunderbird, français et anglais. */
const FORWARD_MARKERS = [
  /^-{3,}\s*forwarded message\s*-{3,}$/i,
  /^-{3,}\s*message transf[ée]r[ée]\s*-{3,}$/i,
  /^begin forwarded message\s*:?$/i,
  /^d[ée]but du message r[ée]exp[ée]di[ée]\s*:?$/i,
];

/**
 * Les séparateurs AMBIGUS : Outlook écrit les mêmes (« -----Message
 * d'origine----- », la longue ligne de soulignés) pour une RÉPONSE et pour
 * un transfert. Les traiter comme des transferts retournait le sens du
 * message le plus courant du module — un membre qui répond à son client
 * avec l'ingestion en copie devenait un email « entrant » du client, et
 * l'envoi automatique s'arrêtait tout seul. Ils ne comptent donc que si
 * l'objet annonce un transfert et PAS une réponse.
 */
const AMBIGUOUS_MARKERS = [
  /^-{3,}\s*original message\s*-{3,}$/i,
  /^-{3,}\s*message d'origine\s*-{3,}$/i,
  /^_{10,}$/,
];

const FIELD_FROM = /^\s*>?\s*\*?(?:from|de|von|da)\s*\*?\s*:\s*\*?(.+?)\*?\s*$/i;
const FIELD_DATE = /^\s*>?\s*\*?(?:date|sent|envoy[ée]|gesendet)\s*\*?\s*:\s*\*?(.+?)\*?\s*$/i;
const FIELD_SUBJECT = /^\s*>?\s*\*?(?:subject|objet|betreff|oggetto)\s*\*?\s*:\s*\*?(.+?)\*?\s*$/i;
// « à », pas « a » : un « a: » nu attrape n'importe quelle ligne de prose.
const FIELD_TO = /^\s*>?\s*\*?(?:to|à|an|cc|copie)\s*\*?\s*:\s*\*?(.+?)\*?\s*$/i;

/**
 * Cherche un bloc d'en-têtes transféré : un séparateur connu, ou — quand
 * l'objet dit « Fwd: » — une ligne `From:`/`De :` suivie de près par une
 * ligne `Subject`/`Date`/`To`. Rend null quand rien n'est reconnu.
 */
export function findForwardedBlock(text: string, subjectSaysForward: boolean, subjectSaysReply = false): ForwardedBlock | null {
  const lines = text.split("\n");
  const markers = subjectSaysForward && !subjectSaysReply ? [...FORWARD_MARKERS, ...AMBIGUOUS_MARKERS] : FORWARD_MARKERS;
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (markers.some((m) => m.test(line))) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) {
    if (!subjectSaysForward) return null;
    for (let i = 0; i < lines.length; i++) {
      const from = lines[i].match(FIELD_FROM);
      // Sans séparateur, il faut de VRAIES preuves : une adresse dans le
      // « De : », et deux autres champs distincts. Sinon une prose qui
      // contient « From: la doc, page 3 » devient un bloc transféré.
      if (!from || !extractEmail(from[1])) continue;
      const window = lines.slice(i + 1, i + 7);
      const distinct = [FIELD_SUBJECT, FIELD_DATE, FIELD_TO].filter((field) => window.some((l) => field.test(l))).length;
      if (distinct >= 2) {
        start = i;
        break;
      }
    }
    if (start === -1) return null;
  }

  // Le bloc d'en-têtes : au plus 12 lignes, jusqu'à la première ligne vide après au moins un champ.
  let fromRaw: string | null = null;
  let dateRaw: string | null = null;
  let subject: string | null = null;
  let seenField = false;
  let end = start;
  for (let i = start; i < Math.min(lines.length, start + 12); i++) {
    const line = lines[i];
    if (line.trim() === "") {
      if (seenField) {
        end = i + 1;
        break;
      }
      end = i + 1;
      continue;
    }
    const from = line.match(FIELD_FROM);
    const date = line.match(FIELD_DATE);
    const subj = line.match(FIELD_SUBJECT);
    const to = line.match(FIELD_TO);
    if (from && fromRaw === null) fromRaw = from[1].trim();
    else if (date && dateRaw === null) dateRaw = date[1].trim();
    else if (subj && subject === null) subject = subj[1].trim();
    else if (!to && !from && !date && !subj) {
      if (seenField) {
        end = i;
        break;
      }
      // Une ligne qui n'est pas un champ avant tout champ : pas un bloc.
      return null;
    }
    seenField = true;
    end = i + 1;
  }
  if (!seenField || fromRaw === null) return null;
  const email = extractEmail(fromRaw);
  const name = extractDisplayName(fromRaw) ?? (email ? null : decodeEncodedWords(fromRaw.replace(/[<>"]/g, "").trim()) || null);
  return { fromRaw, email, name, date: dateRaw ? parseHumanDate(dateRaw) : null, subject, body: lines.slice(end).join("\n").trim() };
}

/* ---------- dates humaines (« jeu. 27 août 2026 à 09:12 », « Thu, Aug 27, 2026 at 9:12 AM », « 27/08/2026 09:12 ») ---------- */

const MONTHS: Record<string, number> = {
  jan: 1, janv: 1, january: 1, janvier: 1, feb: 2, fev: 2, "fév": 2, "févr": 2, february: 2, "février": 2, fevrier: 2, mar: 3, mars: 3, march: 3,
  apr: 4, avr: 4, april: 4, avril: 4, may: 5, mai: 5, jun: 6, juin: 6, june: 6, jul: 7, juil: 7, juill: 7, july: 7, juillet: 7,
  aug: 8, "août": 8, aout: 8, august: 8, sep: 9, sept: 9, september: 9, septembre: 9, oct: 10, october: 10, octobre: 10,
  nov: 11, november: 11, novembre: 11, dec: 12, "déc": 12, december: 12, "décembre": 12, decembre: 12,
};

/** Le décalage écrit dans la date (« +0200 », « UTC+2 », « GMT-05:00 », « Z »), en minutes ; null quand rien n'est écrit. */
function offsetMinutes(text: string): number | null {
  if (/\bZ\b/.test(text) || /\b(UTC|GMT)\b(?![+-])/i.test(text)) return 0;
  const match = text.match(/(?:UTC|GMT)?\s*([+-])(\d{1,2}):?(\d{2})?\b/);
  if (!match) return null;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

/** L'anglais écrit mm/jj, le français jj/mm : sans indice, on ne tranche pas. */
function languageHint(text: string): "en" | "fr" | null {
  if (/\b(am|pm)\b/i.test(text)) return "en";
  const words = text.toLowerCase().match(/[\p{L}]+/gu) ?? [];
  const english = new Set(["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec", "mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
  const french = new Set(["janvier", "février", "fevrier", "mars", "avril", "mai", "juin", "juillet", "août", "aout", "septembre", "octobre", "novembre", "décembre", "decembre", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche", "janv", "févr", "fevr", "avr", "juil", "déc", "dec"]);
  if (words.some((w) => french.has(w))) return "fr";
  if (words.some((w) => english.has(w))) return "en";
  return null;
}

/**
 * Une date écrite POUR UN HUMAIN, telle qu'un bloc de transfert l'écrit.
 * Deux prudences, apprises en relecture :
 *
 * - le DÉCALAGE écrit (« UTC+2 », « +0200 ») est honoré ; sans décalage, la
 *   date est prise en UTC, faute de mieux, et à la minute — assez pour une
 *   chronologie ;
 * - une date NUMÉRIQUE ambiguë (les deux premiers nombres ≤ 12) ne se
 *   devine pas : « 4/3/2026 » vaut le 4 mars en français et le 3 avril en
 *   anglais. Sans indice de langue dans la ligne, on rend null — l'appelant
 *   retombe sur la date de l'email, ce qui est faux d'un jour, jamais d'un
 *   mois.
 */
export function parseHumanDate(text: string): Date | null {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const time = cleaned.match(/(\d{1,2})[:h](\d{2})(?::(\d{2}))?\s*(am|pm)?/i);
  let hours = time ? Number(time[1]) : 12;
  const minutes = time ? Number(time[2]) : 0;
  if (time?.[4]) {
    const pm = time[4].toLowerCase() === "pm";
    if (pm && hours < 12) hours += 12;
    if (!pm && hours === 12) hours = 0;
  }
  const hint = languageHint(cleaned);
  const offset = offsetMinutes(cleaned.replace(/(\d{1,2})[:h](\d{2})(?::(\d{2}))?/, " "));

  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;
  const numeric = cleaned.match(/(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})/);
  if (numeric) {
    const [a, b, c] = [Number(numeric[1]), Number(numeric[2]), Number(numeric[3])];
    if (numeric[1].length === 4) {
      [year, month, day] = [a, b, c];
    } else {
      const fullYear = c < 100 ? 2000 + c : c;
      if (a > 12) [day, month, year] = [a, b, fullYear];
      else if (b > 12) [month, day, year] = [a, b, fullYear];
      else if (hint === "en") [month, day, year] = [a, b, fullYear];
      else if (hint === "fr") [day, month, year] = [a, b, fullYear];
      else return null; // ambigu et sans indice : ne rien inventer.
    }
  } else {
    const named = cleaned.match(/(\d{1,2})(?:er|st|nd|rd|th)?\.?\s+([\p{L}]+)\.?,?\s+(\d{4})/u) ?? null;
    const namedEn = cleaned.match(/([\p{L}]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/u) ?? null;
    if (named && MONTHS[named[2].toLowerCase()]) [day, month, year] = [Number(named[1]), MONTHS[named[2].toLowerCase()], Number(named[3])];
    else if (namedEn && MONTHS[namedEn[1].toLowerCase()]) [day, month, year] = [Number(namedEn[2]), MONTHS[namedEn[1].toLowerCase()], Number(namedEn[3])];
  }
  if (day === null || month === null || year === null || month < 1 || month > 12 || day < 1 || day > 31) {
    const fallback = new Date(cleaned);
    return Number.isNaN(fallback.getTime()) || fallback.getFullYear() < 1990 ? null : fallback;
  }
  const date = new Date(Date.UTC(year, month - 1, day, hours, minutes) - (offset ?? 0) * 60_000);
  return Number.isNaN(date.getTime()) ? null : date;
}

/* ---------- signature et téléphone ---------- */

/** Les 15 dernières lignes non citées, non vides, du texte — la zone où vit une signature. */
export function signatureLines(text: string, count = 15): string[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith(">"));
  return lines.slice(-count);
}

const PHONE_PATTERN = /(?:\+\d{1,3}[\s.-]?(?:\(0\))?[\s.-]?|\b0)\d(?:[\s.-]?\d{2}){4}\b|\+\d{1,3}(?:[\s.-]?\d{2,4}){3,5}\b/;
/** Une ligne qui parle d'un NUMÉRO DE DOSSIER : dix chiffres y ressemblent à un téléphone sans en être un. */
const NOT_A_PHONE = /\b(r[ée]f\.?|r[ée]f[ée]rence|n[°o]\s|dossier|facture|commande|contrat|siret|siren|rcs|tva|iban|orias)\b/i;
/** Une ligne qui ANNONCE un téléphone : le numéro y est sûr, ailleurs c'est un pari. */
const PHONE_LABEL = /\b(t[ée]l\.?|telephone|t[ée]l[ée]phone|phone|mob\.?|mobile|portable|gsm|fax)\b/i;

/**
 * Le premier numéro de forme téléphonique des lignes, avec ce qu'on en
 * sait : `labelled` quand la ligne l'annonce (« Tél. … ») ou qu'il porte un
 * indicatif international — sinon c'est une forme, pas une certitude, et
 * l'écran l'affichera « à vérifier ». Les lignes de références (« Réf.
 * dossier 0123456789 ») sont écartées.
 */
export function findPhoneDetail(lines: string[]): { value: string; labelled: boolean } | null {
  for (const line of lines) {
    if (NOT_A_PHONE.test(line)) continue;
    const match = line.match(PHONE_PATTERN);
    if (!match) continue;
    const value = match[0].replace(/\s+/g, " ").trim();
    return { value, labelled: PHONE_LABEL.test(line) || value.startsWith("+") };
  }
  return null;
}

/** Un numéro de téléphone lisible (formats français et internationaux), le premier trouvé dans les lignes ; null sinon. */
export function findPhone(lines: string[]): string | null {
  return findPhoneDetail(lines)?.value ?? null;
}

/* ---------- la synthèse ---------- */

export function parseInbound(args: {
  subject: string;
  text: string | null;
  html: string | null;
  fromEmail: string;
  fromName: string | null;
  to: string[];
  cc: string[];
  emailDate: Date;
  /** Les adresses des membres de l'organisation, en minuscules. */
  memberEmails: string[];
  /** Le domaine d'ingestion (`in.clozado.fr`) : une adresse dessus n'est jamais une contrepartie. */
  inboundDomain: string;
}): ParsedInbound {
  const text = args.text?.trim() ? normalizeText(args.text) : args.html ? htmlToText(args.html) : "";
  const subjectSaysForward = isForwardSubject(args.subject);
  const forwarded = findForwardedBlock(text, subjectSaysForward, REPLY_SUBJECT.test(args.subject));
  const members = new Set(args.memberEmails.map((e) => (extractEmail(e) ?? e.toLowerCase())));
  const isExternal = (email: string) => !members.has(email.toLowerCase()) && domainOf(email) !== args.inboundDomain.toLowerCase();
  // Le fournisseur peut rendre « Nom <a@b> » : sans normalisation, un membre
  // écrit sous cette forme n'était plus reconnu — et la contrepartie proposée
  // devenait la collègue du membre.
  const recipients = [...args.to, ...args.cc].map((value) => extractEmail(value)).filter((value): value is string => value !== null);

  if (forwarded) {
    const originalBody = forwarded.body || text;
    const lines = signatureLines(originalBody);
    const found = findPhoneDetail(lines);
    return {
      mode: "forward",
      counterpartEmail: forwarded.email && isExternal(forwarded.email) ? forwarded.email : null,
      counterpartName: forwarded.name,
      occurredAt: forwarded.date ?? args.emailDate,
      subject: cleanSubject(forwarded.subject ?? args.subject),
      originalBody,
      signatureLines: lines,
      phone: found?.value ?? null,
      phoneLabelled: found?.labelled ?? false,
    };
  }

  const external = recipients.find(isExternal) ?? null;
  const lines = signatureLines(text);
  const found = findPhoneDetail(lines);
  const common = { counterpartEmail: external, counterpartName: null, occurredAt: args.emailDate, subject: cleanSubject(args.subject), originalBody: text, signatureLines: lines, phone: found?.value ?? null, phoneLabelled: found?.labelled ?? false };
  if (external && !subjectSaysForward) return { mode: "copy", ...common };
  // Ni l'un ni l'autre : le sens et la contrepartie seront choisis par la personne.
  return { mode: null, ...common };
}
