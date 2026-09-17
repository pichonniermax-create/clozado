import { localeOfUser } from "@/i18n/locale-lookup";
import { translatorFor } from "@/i18n/translator";
import { formatLoginCode, validityLabel } from "@/lib/auth/magic-link";
import { DEFAULT_BRAND_PRIMARY, PRODUCT_NAME } from "@/lib/brand";

/**
 * L'email du lien de connexion — le seul email système qui part
 * aujourd'hui. Écrit dans la langue de son DESTINATAIRE (`users.locale`,
 * sinon celle de son organisation, sinon le français), pas dans celle de
 * la requête : il n'y a pas de personne connectée au moment de l'envoi.
 * Remplace le modèle anglais d'Auth.js. Aux couleurs du produit : la
 * connexion reste Clozado (étape 3), l'email au nom de l'organisation
 * viendra avec les emails système de l'étape 5.
 *
 * Depuis le correctif du 2026-09-17 : le lien ouvre notre page de
 * confirmation (rien n'est consommé avant le clic sur « Me connecter »),
 * la durée de validité est celle des réglages, et un CODE à six chiffres
 * accompagne le lien pour le cas où il pose problème.
 */
export type MagicLinkEmail = { subject: string; text: string; html: string };

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export async function renderMagicLinkEmail(to: string, url: string, extra: { validityMinutes: number; code?: string }): Promise<MagicLinkEmail> {
  const locale = await localeOfUser({ email: to });
  const t = await translatorFor(locale, "auth.magicLink");
  const product = PRODUCT_NAME;
  const color = DEFAULT_BRAND_PRIMARY;
  const safeUrl = escapeHtml(url);
  const validity = validityLabel(extra.validityMinutes, locale);
  const code = extra.code ? formatLoginCode(extra.code) : null;
  const codeRows = code
    ? `<tr><td style="padding:20px 32px 0;font-size:13px;line-height:1.5;color:#3f3f46">${escapeHtml(t("code_intro"))}</td></tr>
<tr><td style="padding:8px 32px 0;font-size:26px;font-weight:700;letter-spacing:0.12em;font-family:Menlo,Consolas,monospace;color:#18181b">${escapeHtml(code)}</td></tr>
<tr><td style="padding:6px 32px 0;font-size:13px;line-height:1.5;color:#71717a">${escapeHtml(t("code_hint", { validity }))}</td></tr>`
    : "";
  const html = `<!doctype html><html lang="${locale}"><body style="margin:0;padding:32px 16px;background:#f4f4f5;font-family:Helvetica,Arial,sans-serif;color:#18181b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;border:1px solid #e4e4e7">
<tr><td style="padding:28px 32px 8px;font-size:13px;font-weight:700;color:${color}">${escapeHtml(product)}</td></tr>
<tr><td style="padding:0 32px;font-size:20px;font-weight:600">${escapeHtml(t("heading"))}</td></tr>
<tr><td style="padding:12px 32px 0;font-size:15px;line-height:1.5;color:#3f3f46">${escapeHtml(t("intro", { product, validity }))}</td></tr>
<tr><td style="padding:24px 32px"><a href="${safeUrl}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:${color};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none">${escapeHtml(t("button"))}</a></td></tr>
<tr><td style="padding:0 32px;font-size:13px;line-height:1.5;color:#71717a">${escapeHtml(t("fallback"))}<br><a href="${safeUrl}" style="color:${color};word-break:break-all">${safeUrl}</a></td></tr>
${codeRows}
<tr><td style="padding:20px 32px 28px;font-size:13px;line-height:1.5;color:#71717a">${escapeHtml(t("ignore"))}</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: t("subject", { product }), text: code ? t("text_avec_code", { product, url, validity, code }) : t("text", { product, url, validity }), html };
}
