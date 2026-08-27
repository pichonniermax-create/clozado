import type { AnyBlock } from "./blocks";
import { DEFAULT_BRAND_PRIMARY } from "@/lib/brand";

/**
 * Rendu HTML email — un seul format, directement email-safe (styles inlinés
 * dès l'écriture, jamais de <style> dont la mise en page dépendrait). Ça
 * évite d'avoir à maintenir un rendu "standard" séparé puis un passage
 * d'inlining : l'export HubSpot/Brevo spécifique est hors périmètre de ce
 * chantier, donc un seul format suffit.
 *
 * Applique les pièges documentés (dossier de reconstruction, §6),
 * indépendants de toute marque :
 * - padding/fond posés sur <td>, jamais sur <table> (plusieurs
 *   clients/importeurs ignorent padding/background sur <table>) ;
 * - aucune dépendance à <style> pour la mise en page de base (le <style>
 *   inclus n'apporte que des améliorations progressives — dark mode,
 *   resserrement mobile — jamais requises pour un rendu correct) ;
 * - rangée de chiffres clés en vraie <table> à largeur fixe (33.33% par
 *   <td>), jamais des colonnes flottantes qui s'empilent de façon
 *   incohérente selon le client.
 *
 * Aucune valeur de marque en dur : tout vient de `RenderBrand`, résolu par
 * l'appelant depuis `organizations` (voir src/db/queries/newsletters.ts).
 * Les couleurs/polices par défaut ci-dessous (FALLBACK_*) sont des filets de
 * sécurité neutres pour une organisation qui n'a pas encore configuré sa
 * marque — ce ne sont les couleurs/polices d'AUCUN client.
 */

export type RenderBrand = {
  name: string;
  logoUrl: string | null;
  logoLockupText: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  inkColor: string | null;
  backgroundColor: string | null;
  headingFontFamily: string | null;
  headingFontFallback: string | null;
  fontFamily: string | null;
  bodyFontFallback: string | null;
  borderRadius: number | null;
};

export type RenderSignatory = {
  name: string;
  jobTitle: string | null;
} | null;

/**
 * LE PIED DE PAGE CONFORME (chantier engagement, §3.4) — des phrases déjà
 * traduites dans la langue de l'organisation et les faits de
 * l'organisation, composés par `buildFooter` (src/lib/email/footer.ts)
 * depuis son profil de pays. Le rendu ne sait rien du droit : il pose ce
 * qu'on lui donne, dans cet ordre.
 */
export type RenderFooter = {
  /** « Vous recevez cet email parce que vous êtes en contact avec … » */
  why: string;
  /** Le libellé du lien de désinscription et son adresse. */
  unsubscribeLabel: string;
  unsubscribeUrl: string;
  /** La phrase sur le délai de prise en compte, quand le profil l'exige ; null sinon. */
  unsubscribeDelay: string | null;
  /** L'adresse postale de l'expéditeur (une ligne par retour à la ligne). */
  postalAddress: string | null;
  /** Les mentions légales libres. */
  legalMention: string | null;
  /** « Cet email mesure les ouvertures et les clics. » — null quand le profil ne l'exige pas. */
  tracking: string | null;
  /** La politique de confidentialité de l'organisation, quand elle existe. */
  privacyLabel: string | null;
  privacyUrl: string | null;
  /** L'avertissement d'un email de test, en tête du pied de page ; null pour un envoi réel. */
  testNotice: string | null;
};

export type RenderInput = {
  brand: RenderBrand;
  subject: string;
  preheader: string;
  blocks: AnyBlock[];
  signatory: RenderSignatory;
  /** Le pied de page conforme — absent dans l'éditeur (aperçu de la feuille), toujours présent dans un email qui part. */
  footer?: RenderFooter | null;
  /** La langue des contenus (attribut `lang` du document) — celle de l'organisation ; « fr » à défaut. */
  lang?: string;
  /**
   * Rendu destiné à l'éditeur : ajoute une ancre `data-block` par bloc pour
   * que le clic sache quel bloc ouvrir. Faux (défaut) pour tout rendu qui
   * part réellement par email — le HTML produit est alors inchangé.
   */
  editable?: boolean;
};

const FALLBACK_PRIMARY = DEFAULT_BRAND_PRIMARY;
const FALLBACK_SECONDARY = "#0f172a";
const FALLBACK_INK = "#1a1a1a";
const FALLBACK_BACKGROUND = "#f4f4f2";
// eslint-disable-next-line local/no-visible-text -- une pile de polices CSS, pas un texte
const FALLBACK_HEADING_FONT = "Georgia, 'Times New Roman', serif";
const FALLBACK_BODY_FONT = "Arial, Helvetica, sans-serif";
const FALLBACK_RADIUS = 6;

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** "un paragraphe\n\nun autre" -> un <p> par paragraphe (jamais deux blocs texte à la suite dans le modèle). */
function textParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 12px 0;">${escapeHtml(p)}</p>`)
    .join("");
}

/**
 * <td> avec fond/padding — jamais un fond/padding posé sur <table>
 * directement (piège HubSpot documenté en §6.2 du dossier de reconstruction).
 */
function box(
  content: string,
  opts: { bg?: string; padding?: string; radius?: number; attrs?: string } = {}
) {
  const style = [
    opts.bg ? `background:${opts.bg};` : "",
    `padding:${opts.padding ?? "24px"};`,
    opts.radius ? `border-radius:${opts.radius}px;` : "",
  ].join("");
  const attrs = opts.attrs ? ` ${opts.attrs}` : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td${attrs} style="${style}">${content}</td></tr></table>`;
}

function renderTitre(block: Extract<AnyBlock, { type: "titre" }>, brand: ResolvedBrand): string {
  const tag = block.level === 1 ? "h1" : block.level === 2 ? "h2" : "h3";
  const size = block.level === 1 ? "28px" : block.level === 2 ? "22px" : "18px";
  const eyebrow = block.eyebrow
    ? `<p style="margin:0 0 6px 0;font:600 12px/1.4 ${brand.bodyFont};letter-spacing:0.08em;text-transform:uppercase;color:${brand.secondary};">${escapeHtml(block.eyebrow)}</p>`
    : "";
  return `${eyebrow}<${tag} style="margin:0 0 16px 0;font:700 ${size}/1.3 ${brand.headingFont};color:${brand.ink};">${escapeHtml(block.text)}</${tag}>`;
}

function renderTexte(block: Extract<AnyBlock, { type: "texte" }>, brand: ResolvedBrand): string {
  return `<div style="font:400 15px/1.6 ${brand.bodyFont};color:${brand.ink};">${textParagraphs(block.text)}</div>`;
}

function renderKpiRow(
  group: Extract<AnyBlock, { type: "chiffre_cle" }>[],
  brand: ResolvedBrand,
  /** Index du premier bloc du groupe dans la liste — `null` hors mode éditeur. */
  startIndex: number | null
): string {
  // Symétrie des légendes : soit toutes les colonnes du groupe ont une
  // légende, soit aucune — jamais une seule (le pied de rangée doit s'aligner).
  const showCaptions = group.every((b) => b.caption.trim().length > 0);
  const width = (100 / group.length).toFixed(2);
  const cells = group
    .map((b, i) => {
      // Chaque colonne porte SON index : les chiffres clés consécutifs sont
      // fusionnés en une seule rangée visuelle, sans ça on ne pourrait pas
      // désigner le deuxième chiffre d'une rangée de trois.
      const attrs = startIndex === null ? "" : ` ${blockAttrs(startIndex + i)}`;
      return `<td${attrs} width="${width}%" style="padding:16px 8px;text-align:center;vertical-align:top;">
        <div style="font:700 24px/1.2 ${brand.headingFont};color:${brand.primary};">${escapeHtml(b.value)}</div>
        <div style="margin-top:4px;font:600 12px/1.4 ${brand.bodyFont};color:${brand.ink};">${escapeHtml(b.label)}</div>
        ${showCaptions ? `<div style="margin-top:2px;font:400 11px/1.4 ${brand.bodyFont};color:${brand.secondary};">${escapeHtml(b.caption)}</div>` : ""}
      </td>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;"><tr>${cells}</tr></table>`;
}

function renderFiches(block: Extract<AnyBlock, { type: "fiches" }>, brand: ResolvedBrand): string {
  const cards = block.cards
    .map(
      (c) => box(
        `<div style="font:700 14px/1.4 ${brand.headingFont};color:${brand.ink};margin:0 0 6px 0;">${escapeHtml(c.title)}</div>
         <div style="font:400 14px/1.5 ${brand.bodyFont};color:${brand.ink};">${escapeHtml(c.text)}</div>`,
        { bg: "#ffffff", padding: "16px", radius: brand.radius }
      )
    )
    .join(`<div style="height:8px;line-height:8px;font-size:0;">&nbsp;</div>`);
  return cards;
}

function renderCta(block: Extract<AnyBlock, { type: "cta" }>, brand: ResolvedBrand): string {
  const inner = `
    <div style="font:700 18px/1.3 ${brand.headingFont};color:#ffffff;margin:0 0 8px 0;">${escapeHtml(block.title)}</div>
    <div style="font:400 14px/1.5 ${brand.bodyFont};color:#ffffff;margin:0 0 16px 0;">${escapeHtml(block.text)}</div>
    ${bulletproofButton(block.buttonLabel, block.url, brand)}`;
  return box(inner, { bg: brand.ink, padding: "24px", radius: brand.radius });
}

function bulletproofButton(label: string, url: string, brand: ResolvedBrand): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="background:${brand.primary};border-radius:${brand.radius}px;padding:0;">
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 24px;font:700 14px/1 ${brand.bodyFont};color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a>
    </td>
  </tr></table>`;
}

function renderBouton(block: Extract<AnyBlock, { type: "bouton" }>, brand: ResolvedBrand): string {
  return bulletproofButton(block.label, block.url, brand);
}

/**
 * Les SOURCES (étape 6) : les articles de la matière dont l'email s'inspire,
 * chacun avec son lien — le titre lié, l'éditeur et la date. Un intitulé
 * court au-dessus (celui du bloc), une ligne par article, en table à une
 * colonne pour que tous les clients l'alignent pareil. Un bloc sans article
 * ne rend que son intitulé (le brouillon qu'on vient d'insérer).
 */
function renderSources(block: Extract<AnyBlock, { type: "sources" }>, brand: ResolvedBrand): string {
  const heading = block.title
    ? `<p style="margin:0 0 8px 0;font:600 12px/1.4 ${brand.bodyFont};letter-spacing:0.08em;text-transform:uppercase;color:${brand.secondary};">${escapeHtml(block.title)}</p>`
    : "";
  const rows = block.items
    .map((item) => {
      const meta = [item.publisher, item.date].filter(Boolean).map(escapeHtml).join(", ");
      return `<tr><td style="padding:4px 0;font:400 13px/1.5 ${brand.bodyFont};color:${brand.ink};"><a href="${escapeHtml(item.url)}" style="color:${brand.primary};text-decoration:underline;">${escapeHtml(item.title)}</a>${meta ? `<span style="color:${brand.secondary};"> — ${meta}</span>` : ""}</td></tr>`;
    })
    .join("");
  const list = rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>` : "";
  return `${heading}${list}`;
}

function renderSeparateur(brand: ResolvedBrand): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:16px 0;"><div style="border-top:1px solid ${brand.secondary};font-size:0;line-height:0;">&nbsp;</div></td></tr></table>`;
}

type ResolvedBrand = {
  name: string;
  logoUrl: string | null;
  logoLockupText: string;
  primary: string;
  secondary: string;
  ink: string;
  background: string;
  headingFont: string;
  bodyFont: string;
  radius: number;
};

function resolveBrand(brand: RenderBrand): ResolvedBrand {
  return {
    name: brand.name,
    logoUrl: brand.logoUrl,
    logoLockupText: brand.logoLockupText ?? brand.name,
    primary: brand.primaryColor || FALLBACK_PRIMARY,
    secondary: brand.secondaryColor || FALLBACK_SECONDARY,
    ink: brand.inkColor || FALLBACK_INK,
    background: brand.backgroundColor || FALLBACK_BACKGROUND,
    headingFont: [brand.headingFontFamily, brand.headingFontFallback || FALLBACK_HEADING_FONT]
      .filter(Boolean)
      .join(", "),
    bodyFont: [brand.fontFamily, brand.bodyFontFallback || FALLBACK_BODY_FONT]
      .filter(Boolean)
      .join(", "),
    radius: brand.borderRadius ?? FALLBACK_RADIUS,
  };
}

function renderHeader(brand: ResolvedBrand): string {
  const logo = brand.logoUrl
    ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.name)}" height="32" style="display:block;border:0;" />`
    : `<span style="font:700 18px/1 ${brand.headingFont};color:${brand.ink};">${escapeHtml(brand.logoLockupText)}</span>`;
  return box(logo, { padding: "24px 24px 8px 24px" });
}

function renderSignature(signatory: RenderSignatory, brand: ResolvedBrand): string {
  if (!signatory) return "";
  const jobTitle = signatory.jobTitle
    ? `<div style="font:400 12px/1.5 ${brand.bodyFont};color:${brand.secondary};">${escapeHtml(signatory.jobTitle)}</div>`
    : "";
  return box(
    `<div style="font:700 13px/1.5 ${brand.bodyFont};color:${brand.ink};">${escapeHtml(signatory.name)}</div>${jobTitle}`,
    { padding: "8px 24px 24px 24px" }
  );
}

/** Le pied de page : petites lignes grises, une table à une colonne — jamais dépendant d'un <style>. */
function renderFooter(footer: RenderFooter, brand: ResolvedBrand): string {
  const line = (html: string) => `<p style="margin:0 0 6px 0;font:400 12px/1.5 ${brand.bodyFont};color:${brand.secondary};">${html}</p>`;
  const link = (href: string, label: string) => `<a href="${escapeHtml(href)}" style="color:${brand.secondary};text-decoration:underline;">${escapeHtml(label)}</a>`;
  const lines: string[] = [];
  if (footer.testNotice) {
    lines.push(`<p style="margin:0 0 10px 0;padding:8px 10px;border:1px dashed ${brand.secondary};font:600 12px/1.5 ${brand.bodyFont};color:${brand.ink};">${escapeHtml(footer.testNotice)}</p>`);
  }
  lines.push(line(`${escapeHtml(footer.why)} ${link(footer.unsubscribeUrl, footer.unsubscribeLabel)}`));
  if (footer.unsubscribeDelay) lines.push(line(escapeHtml(footer.unsubscribeDelay)));
  if (footer.postalAddress) lines.push(line(escapeHtml(footer.postalAddress).replace(/\r?\n/g, "<br>")));
  if (footer.legalMention) lines.push(line(escapeHtml(footer.legalMention).replace(/\r?\n/g, "<br>")));
  const tail = [footer.tracking ? escapeHtml(footer.tracking) : "", footer.privacyUrl && footer.privacyLabel ? link(footer.privacyUrl, footer.privacyLabel) : ""].filter(Boolean).join(" ");
  if (tail) lines.push(line(tail));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:16px 24px 24px 24px;border-top:1px solid ${brand.secondary};">${lines.join("")}</td></tr></table>`;
}

/**
 * Ancre de clic de l'éditeur. `data-*` sur un `<td>` est inerte dans tous les
 * clients email — mais par prudence elle n'est émise QUE quand
 * `RenderInput.editable` est vrai : le HTML enregistré ou exporté reste
 * strictement identique à ce qu'il était avant ce chantier.
 */
function blockAttrs(index: number): string {
  return `data-block="${index}"`;
}

/**
 * Une UNITÉ VISUELLE du corps de l'email, avec les index des blocs qu'elle
 * représente. Presque toujours un bloc pour une unité — sauf les chiffres
 * clés consécutifs, que le modèle email fusionne en une seule rangée de
 * colonnes. L'éditeur a besoin de cette correspondance : il affiche des
 * unités, mais il édite des blocs.
 */
export type RenderedUnit = { indices: number[]; html: string };

/**
 * Le découpage du corps en unités visuelles — la SEULE source du regroupement.
 * `renderBlocks` n'en est que la concaténation, et l'éditeur consomme la même
 * liste : impossible que l'écran et l'email regroupent différemment.
 */
export function renderBlockUnits(
  blocks: AnyBlock[],
  rawBrand: RenderBrand,
  editable = false
): RenderedUnit[] {
  const brand = resolveBrand(rawBrand);
  const out: RenderedUnit[] = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    if (block.type === "chiffre_cle") {
      const start = i;
      const group: Extract<AnyBlock, { type: "chiffre_cle" }>[] = [];
      while (i < blocks.length && blocks[i].type === "chiffre_cle") {
        group.push(blocks[i] as Extract<AnyBlock, { type: "chiffre_cle" }>);
        i++;
      }
      out.push({
        indices: group.map((_, n) => start + n),
        html: box(renderKpiRow(group, brand, editable ? start : null), { padding: "8px 24px" }),
      });
      continue;
    }
    const inner =
      block.type === "titre"
        ? renderTitre(block, brand)
        : block.type === "texte"
          ? renderTexte(block, brand)
          : block.type === "fiches"
            ? renderFiches(block, brand)
            : block.type === "cta"
              ? renderCta(block, brand)
              : block.type === "bouton"
                ? renderBouton(block, brand)
                : block.type === "sources"
                  ? renderSources(block, brand)
                  : renderSeparateur(brand);
    const attrs = editable ? blockAttrs(i) : undefined;
    // Le séparateur n'est pas encadré en rendu normal (il porte ses propres
    // marges) : en mode éditeur il l'est quand même, sinon il n'aurait aucune
    // surface cliquable à laquelle accrocher son index.
    const html =
      block.type === "separateur" && !editable
        ? inner
        : box(inner, { padding: block.type === "separateur" ? "0" : "8px 24px", attrs });
    out.push({ indices: [i], html });
    i++;
  }
  return out;
}

function renderBlocks(blocks: AnyBlock[], brand: RenderBrand, editable: boolean): string {
  return renderBlockUnits(blocks, brand, editable)
    .map((u) => u.html)
    .join("");
}

/**
 * De quoi reconstituer la feuille de l'email autour des unités, sans en
 * réécrire une deuxième version : l'éditeur affiche ces fragments et ces
 * valeurs tels quels. Tout vient de `resolveBrand`, comme le rendu d'envoi.
 */
export type DocumentShell = {
  /** Fond de la page autour de la feuille. */
  pageBackground: string;
  /** Fond de la feuille elle-même — la valeur en dur du gabarit email. */
  sheetBackground: string;
  /** Largeur de la feuille, en pixels. */
  width: number;
  headerHtml: string;
  signatureHtml: string;
};

export function renderDocumentShell(
  rawBrand: RenderBrand,
  signatory: RenderSignatory
): DocumentShell {
  const brand = resolveBrand(rawBrand);
  return {
    pageBackground: brand.background,
    sheetBackground: "#ffffff",
    width: 600,
    headerHtml: renderHeader(brand),
    signatureHtml: renderSignature(signatory, brand),
  };
}

/** Span caché, complété par des caractères invisibles pour éviter que le corps ne "fuite" dans l'aperçu du préheader. */
function renderPreheader(preheader: string): string {
  const padding = "‌ ".repeat(40);
  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;">${escapeHtml(preheader)}${padding}</div>`;
}

export function renderNewsletterHtml(input: RenderInput): string {
  const brand = resolveBrand(input.brand);
  const body = renderBlocks(input.blocks, input.brand, input.editable ?? false);

  return `<!doctype html>
<html lang="${escapeHtml(input.lang ?? "fr")}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light dark" />
<meta name="supported-color-schemes" content="light dark" />
<title>${escapeHtml(input.subject)}</title>
<!--[if mso]>
<style type="text/css">table,td,div,h1,h2,h3,p { font-family: Arial, sans-serif !important; }</style>
<![endif]-->
<style>
  /* Améliorations progressives seulement — la mise en page ci-dessous ne dépend d'aucune de ces règles. */
  @media (prefers-color-scheme: dark) { body { background:${brand.background} !important; } }
  @media (max-width: 620px) {
    .container { width: 100% !important; }
    .stack-padding { padding-left: 16px !important; padding-right: 16px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${brand.background};">
${renderPreheader(input.preheader)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${brand.background};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;">
<tr><td>
${renderHeader(brand)}
${body}
${renderSignature(input.signatory, brand)}
${input.footer ? renderFooter(input.footer, brand) : ""}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * LA VERSION TEXTE de l'email (la partie `text/plain` qui accompagne le
 * HTML : lisible par les clients qui ne rendent pas le HTML, et un signal
 * de sérieux pour les filtres) — les mêmes blocs, sans mise en page : un
 * titre en majuscules, les chiffres clés en « valeur — libellé », les
 * boutons en « libellé : adresse », le pied de page en lignes.
 */
export function renderNewsletterText(input: Pick<RenderInput, "subject" | "preheader" | "blocks" | "signatory" | "footer" | "brand">): string {
  const out: string[] = [];
  if (input.preheader.trim()) out.push(input.preheader.trim(), "");
  for (const block of input.blocks) {
    switch (block.type) {
      case "titre":
        out.push(block.level === 1 ? block.text.toUpperCase() : block.text, "");
        break;
      case "texte":
        out.push(block.text.trim(), "");
        break;
      case "chiffre_cle":
        out.push(`${block.value} — ${block.label}${block.caption ? ` (${block.caption})` : ""}`);
        break;
      case "fiches":
        for (const card of block.cards) out.push(`• ${card.title}`, `  ${card.text}`);
        out.push("");
        break;
      case "cta":
        out.push(block.title, block.text, `${block.buttonLabel} : ${block.url}`, "");
        break;
      case "bouton":
        out.push(`${block.label} : ${block.url}`, "");
        break;
      case "sources":
        if (block.items.length > 0) {
          out.push(block.title);
          for (const item of block.items) out.push(`- ${item.title} — ${item.url}`);
          out.push("");
        }
        break;
      case "separateur":
        out.push("—", "");
        break;
    }
  }
  if (input.signatory) out.push(input.signatory.name, ...(input.signatory.jobTitle ? [input.signatory.jobTitle] : []), "");
  const footer = input.footer;
  if (footer) {
    out.push("--");
    if (footer.testNotice) out.push(footer.testNotice);
    out.push(`${footer.why} ${footer.unsubscribeLabel} : ${footer.unsubscribeUrl}`);
    if (footer.unsubscribeDelay) out.push(footer.unsubscribeDelay);
    if (footer.postalAddress) out.push(footer.postalAddress);
    if (footer.legalMention) out.push(footer.legalMention);
    if (footer.tracking) out.push(footer.tracking);
    if (footer.privacyUrl && footer.privacyLabel) out.push(`${footer.privacyLabel} : ${footer.privacyUrl}`);
  }
  // Jamais deux lignes vides de suite : un texte propre, pas un gruyère.
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
