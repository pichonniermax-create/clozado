import type { AnyBlock } from "./blocks";
import { PREHEADER_MAX, SUBJECT_MAX } from "./review";

/**
 * LE CONTRÔLE AVANT ENVOI (chantier envoi, partie 3) — déterministe, sans
 * IA, sans réseau : les mêmes faits donnent toujours la même liste. Il
 * répond à une seule question, en français : « qu'est-ce qui part, à qui,
 * et qu'est-ce qui cloche ? »
 *
 * Deux niveaux, et deux seulement :
 * - BLOQUANT : l'envoi est refusé (par cette liste ET par le serveur, qui
 *   la rejoue avant de mettre quoi que ce soit en file) — ce qui partirait
 *   serait faux, illisible ou illégal ;
 * - AVERTISSEMENT : l'envoi reste possible, la personne décide en sachant.
 *
 * Chaque ligne est TOUJOURS rendue, même au vert : une liste qui ne montre
 * que les problèmes ne dit pas ce qui a été vérifié. Les messages ne sont
 * pas ici — la revue reste pure : elle rend des codes, l'écran les traduit
 * (même règle que `review.ts`).
 *
 * Ce qui n'y est PAS, et pourquoi : les attributs `alt` et le poids des
 * images (aucun bloc image dans le composer — docs/audit-newsletter.md
 * §J.3), et les mentions métier (elles attendent leurs tables, N3 du même
 * plan). Le jour où elles existent, elles s'ajoutent ici comme une ligne de
 * plus.
 */

/** Les lignes de la liste, dans l'ordre où elles s'affichent. */
export const PREFLIGHT_CHECKS = [
  "objet",
  "preheader",
  "contenu",
  "variables",
  "liens",
  "desinscription",
  "pied_de_page",
  "expediteur",
  "destinataires",
  "rythme",
  "test",
] as const;

export type PreflightCheckCode = (typeof PREFLIGHT_CHECKS)[number];

export type PreflightState = "ok" | "warning" | "blocking";

/** Les messages possibles, un par situation — l'écran en a un libellé par langue. */
export const PREFLIGHT_DETAILS = [
  "objet_vide",
  "objet_trop_long",
  "objet_ok",
  "preheader_vide",
  "preheader_trop_long",
  "preheader_ok",
  "contenu_inacheve",
  "contenu_ok",
  "variables_non_remplacees",
  "variables_aucune",
  "liens_exemple",
  "liens_non_securises",
  "liens_aucun",
  "liens_ok",
  "desinscription_absente",
  "desinscription_ok",
  "pied_adresse_manquante",
  "pied_ok",
  "expediteur_sans_reponse",
  "expediteur_domaine_partage",
  "expediteur_ok",
  "destinataires_aucun",
  "destinataires_exclus",
  "destinataires_ok",
  "rythme_en_pause",
  "rythme_etale",
  "rythme_ok",
  "test_aucun",
  "test_perime",
  "test_ok",
] as const;

export type PreflightDetail = (typeof PREFLIGHT_DETAILS)[number];

export type PreflightRow = {
  code: PreflightCheckCode;
  state: PreflightState;
  detail: PreflightDetail;
  params?: Record<string, string | number>;
};

/** Ce que l'exclusion d'un contact doit à chacune des cinq raisons — la somme des cinq vaut `total - sendable`. */
export type AudienceBreakdown = {
  total: number;
  sendable: number;
  withoutEmail: number;
  /** Désinscrit ou supprimé chez CETTE organisation. */
  suppressed: number;
  /** Autorisation d'écrire jamais établie (un import, une fiche d'avant). */
  consentMissing: number;
  /** Opposition déclarée. */
  objected: number;
  /** Adresse fermée pour toute la plateforme (rebond dur ou plainte, chez n'importe qui). */
  platformSuppressed: number;
};

export type PreflightFacts = {
  subject: string;
  preheader: string;
  blocks: AnyBlock[];
  /** Le niveau « aboutie » du document (aucun champ de copie vide) — calculé par l'appelant avec le schéma. */
  finished: boolean;
  /** Le rendu HTML RÉEL, celui qui partira : c'est en lui qu'on cherche le marqueur de désinscription. */
  html: string;
  /** Le marqueur laissé au rendu à la place du lien propre à chaque message. */
  unsubscribeMarker: string;
  /** Les faits du pied de page qui manquent (adresse postale) — `missingFooterFacts`. */
  postalMissing: boolean;
  replyTo: string | null;
  /** Le domaine mutualisé, quand c'est lui qui envoie faute de domaine vérifié ; null sinon. */
  fallbackDomain: string | null;
  from: string | null;
  /** L'organisation est suspendue d'envoi marketing (seuils dépassés, ou geste du super admin). */
  paused: boolean;
  audience: AudienceBreakdown;
  /** Ce que le quota du jour laisse encore partir (montée progressive comprise). */
  remainingToday: number;
  /** Le dernier email de test parti, et la dernière modification du document. */
  lastTestAt: Date | null;
  updatedAt: Date;
};

/**
 * Une variable de gabarit laissée dans le texte : `{prenom}`, `{lien_rdv}`.
 * Une newsletter n'est rendue QU'UNE FOIS pour toute la vague (un seul HTML
 * en base, un envoi par lots) : rien n'y est substitué par destinataire, la
 * variable partirait telle quelle, accolades comprises. D'où : bloquant.
 */
const VARIABLE_PATTERN = /\{[a-zA-Z_][a-zA-Z0-9_]{1,30}\}/g;

/** Les hôtes qui trahissent un lien d'exemple oublié dans le brouillon. */
const PLACEHOLDER_HOSTS = ["example.com", "example.org", "exemple.com", "exemple.fr", "localhost", "127.0.0.1", "monsite.fr", "mon-site.fr"];

/** Les champs de copie visibles par le lecteur — ceux où une variable oubliée se lirait. */
function copyFieldsOf(block: AnyBlock): string[] {
  switch (block.type) {
    case "titre":
      return [block.text, block.eyebrow];
    case "texte":
      return [block.text];
    case "chiffre_cle":
      return [block.value, block.label, block.caption];
    case "fiches":
      return block.cards.flatMap((c) => [c.title, c.text]);
    case "cta":
      return [block.title, block.text, block.buttonLabel];
    case "bouton":
      return [block.label];
    case "sources":
      return [block.title];
    case "separateur":
      return [];
  }
}

/** Les adresses posées dans un `href` par les blocs — les sources citées comprises : elles partent aussi. */
export function linksOf(blocks: AnyBlock[]): string[] {
  const urls: string[] = [];
  for (const block of blocks) {
    if (block.type === "cta" || block.type === "bouton") {
      if (block.url.trim()) urls.push(block.url.trim());
    } else if (block.type === "sources") {
      for (const item of block.items) if (item.url.trim()) urls.push(item.url.trim());
    }
  }
  return urls;
}

/** Les variables de gabarit trouvées dans l'objet, le pré-en-tête et les blocs, sans doublon et dans l'ordre de lecture. */
export function variablesLeft(facts: Pick<PreflightFacts, "subject" | "preheader" | "blocks">): string[] {
  const found: string[] = [];
  const scan = (text: string) => {
    for (const match of text.matchAll(VARIABLE_PATTERN)) if (!found.includes(match[0])) found.push(match[0]);
  };
  scan(facts.subject);
  scan(facts.preheader);
  for (const block of facts.blocks) for (const field of copyFieldsOf(block)) scan(field);
  return found;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function row(code: PreflightCheckCode, state: PreflightState, detail: PreflightDetail, params?: Record<string, string | number>): PreflightRow {
  return params ? { code, state, detail, params } : { code, state, detail };
}

/**
 * La liste, toujours complète et toujours dans le même ordre. Une ligne par
 * contrôle : c'est elle qu'on lit avant d'envoyer, et c'est elle que le
 * serveur rejoue pour refuser un envoi bloqué.
 */
export function preflightRows(facts: PreflightFacts): PreflightRow[] {
  const rows: PreflightRow[] = [];

  // 1. L'objet — vide, on ne part pas ; trop long, il sera coupé par les messageries.
  const subject = facts.subject.trim();
  if (!subject) rows.push(row("objet", "blocking", "objet_vide"));
  else if (subject.length > SUBJECT_MAX) rows.push(row("objet", "warning", "objet_trop_long", { count: subject.length, max: SUBJECT_MAX }));
  else rows.push(row("objet", "ok", "objet_ok", { count: subject.length }));

  // 2. Le pré-en-tête — absent, la messagerie affiche le début du corps à la place.
  const preheader = facts.preheader.trim();
  if (!preheader) rows.push(row("preheader", "warning", "preheader_vide"));
  else if (preheader.length > PREHEADER_MAX) rows.push(row("preheader", "warning", "preheader_trop_long", { count: preheader.length, max: PREHEADER_MAX }));
  else rows.push(row("preheader", "ok", "preheader_ok", { count: preheader.length }));

  // 3. Le contenu — un champ de copie vide part comme un trou dans la page.
  if (!facts.finished) rows.push(row("contenu", "blocking", "contenu_inacheve"));
  else rows.push(row("contenu", "ok", "contenu_ok", { count: facts.blocks.length }));

  // 4. Les variables de gabarit — elles ne sont jamais remplacées dans une newsletter.
  const variables = variablesLeft(facts);
  if (variables.length > 0) rows.push(row("variables", "blocking", "variables_non_remplacees", { sample: variables.slice(0, 3).join(", "), count: variables.length }));
  else rows.push(row("variables", "ok", "variables_aucune"));

  // 5. Les liens — un lien d'exemple oublié est une erreur qui se voit de loin ; `http:` se fait bloquer ou avertir par les navigateurs.
  const links = linksOf(facts.blocks);
  const placeholder = links.find((url) => PLACEHOLDER_HOSTS.includes(hostOf(url)));
  const insecure = links.find((url) => url.toLowerCase().startsWith("http://"));
  if (placeholder) rows.push(row("liens", "blocking", "liens_exemple", { url: placeholder }));
  else if (insecure) rows.push(row("liens", "warning", "liens_non_securises", { url: insecure }));
  else if (links.length === 0) rows.push(row("liens", "warning", "liens_aucun"));
  else rows.push(row("liens", "ok", "liens_ok", { count: links.length }));

  // 6. La désinscription — le marqueur est posé par le rendu et remplacé message par message à la remise. Absent, personne ne peut se désinscrire : jamais.
  if (!facts.html.includes(facts.unsubscribeMarker)) rows.push(row("desinscription", "blocking", "desinscription_absente"));
  else rows.push(row("desinscription", "ok", "desinscription_ok"));

  // 7. Le pied de page — l'adresse postale est exigée par le profil du pays.
  if (facts.postalMissing) rows.push(row("pied_de_page", "blocking", "pied_adresse_manquante"));
  else rows.push(row("pied_de_page", "ok", "pied_ok"));

  // 8. L'expéditeur — sans adresse de réponse, rien ne part ; sur le domaine mutualisé, la réputation est partagée.
  if (!facts.replyTo) rows.push(row("expediteur", "blocking", "expediteur_sans_reponse"));
  else if (facts.fallbackDomain) rows.push(row("expediteur", "warning", "expediteur_domaine_partage", { domain: facts.fallbackDomain }));
  else rows.push(row("expediteur", "ok", "expediteur_ok", { from: facts.from ?? "" }));

  // 9. Les destinataires — le nombre qui partira VRAIMENT, et ce que chaque exclusion doit à sa raison.
  const a = facts.audience;
  const excluded = a.total - a.sendable;
  if (a.sendable === 0) rows.push(row("destinataires", "blocking", "destinataires_aucun", { total: a.total }));
  else if (excluded > 0) rows.push(row("destinataires", "warning", "destinataires_exclus", { sendable: a.sendable, excluded, total: a.total }));
  else rows.push(row("destinataires", "ok", "destinataires_ok", { sendable: a.sendable }));

  // 10. Le rythme — l'organisation suspendue n'envoie rien ; le quota du jour étale la vague sur plusieurs jours.
  if (facts.paused) rows.push(row("rythme", "blocking", "rythme_en_pause"));
  else if (a.sendable > facts.remainingToday) rows.push(row("rythme", "warning", "rythme_etale", { remaining: facts.remainingToday, recipients: a.sendable }));
  else rows.push(row("rythme", "ok", "rythme_ok", { recipients: a.sendable }));

  // 11. Le test — un test reçu APRÈS la dernière modification, ou il ne prouve rien de ce qui part maintenant.
  if (!facts.lastTestAt) rows.push(row("test", "warning", "test_aucun"));
  else if (facts.lastTestAt.getTime() < facts.updatedAt.getTime()) rows.push(row("test", "warning", "test_perime", { at: facts.lastTestAt.toISOString() }));
  else rows.push(row("test", "ok", "test_ok", { at: facts.lastTestAt.toISOString() }));

  return rows;
}

export function blockingRows(rows: PreflightRow[]): PreflightRow[] {
  return rows.filter((r) => r.state === "blocking");
}

export function countByState(rows: PreflightRow[]): Record<PreflightState, number> {
  return {
    ok: rows.filter((r) => r.state === "ok").length,
    warning: rows.filter((r) => r.state === "warning").length,
    blocking: rows.filter((r) => r.state === "blocking").length,
  };
}
