import type { AnyBlock } from "./blocks";

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

export type RenderInput = {
  brand: RenderBrand;
  subject: string;
  preheader: string;
  blocks: AnyBlock[];
  signatory: RenderSignatory;
};

const FALLBACK_PRIMARY = "#2563eb";
const FALLBACK_SECONDARY = "#0f172a";
const FALLBACK_INK = "#1a1a1a";
const FALLBACK_BACKGROUND = "#f4f4f2";
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
function box(content: string, opts: { bg?: string; padding?: string; radius?: number } = {}) {
  const style = [
    opts.bg ? `background:${opts.bg};` : "",
    `padding:${opts.padding ?? "24px"};`,
    opts.radius ? `border-radius:${opts.radius}px;` : "",
  ].join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="${style}">${content}</td></tr></table>`;
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
  brand: ResolvedBrand
): string {
  // Symétrie des légendes : soit toutes les colonnes du groupe ont une
  // légende, soit aucune — jamais une seule (le pied de rangée doit s'aligner).
  const showCaptions = group.every((b) => b.caption.trim().length > 0);
  const width = (100 / group.length).toFixed(2);
  const cells = group
    .map(
      (b) => `<td width="${width}%" style="padding:16px 8px;text-align:center;vertical-align:top;">
        <div style="font:700 24px/1.2 ${brand.headingFont};color:${brand.primary};">${escapeHtml(b.value)}</div>
        <div style="margin-top:4px;font:600 12px/1.4 ${brand.bodyFont};color:${brand.ink};">${escapeHtml(b.label)}</div>
        ${showCaptions ? `<div style="margin-top:2px;font:400 11px/1.4 ${brand.bodyFont};color:${brand.secondary};">${escapeHtml(b.caption)}</div>` : ""}
      </td>`
    )
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

function renderBlocks(blocks: AnyBlock[], brand: ResolvedBrand): string {
  const out: string[] = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    if (block.type === "chiffre_cle") {
      const group: Extract<AnyBlock, { type: "chiffre_cle" }>[] = [];
      while (i < blocks.length && blocks[i].type === "chiffre_cle") {
        group.push(blocks[i] as Extract<AnyBlock, { type: "chiffre_cle" }>);
        i++;
      }
      out.push(box(renderKpiRow(group, brand), { padding: "8px 24px" }));
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
                : renderSeparateur(brand);
    out.push(block.type === "separateur" ? inner : box(inner, { padding: "8px 24px" }));
    i++;
  }
  return out.join("");
}

/** Span caché, complété par des caractères invisibles pour éviter que le corps ne "fuite" dans l'aperçu du préheader. */
function renderPreheader(preheader: string): string {
  const padding = "‌ ".repeat(40);
  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;opacity:0;">${escapeHtml(preheader)}${padding}</div>`;
}

export function renderNewsletterHtml(input: RenderInput): string {
  const brand = resolveBrand(input.brand);
  const body = renderBlocks(input.blocks, brand);

  return `<!doctype html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
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
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
