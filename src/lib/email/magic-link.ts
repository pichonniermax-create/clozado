import { localeOfUser } from "@/i18n/locale-lookup";
import { translatorFor } from "@/i18n/translator";
import { DEFAULT_BRAND_PRIMARY, PRODUCT_NAME } from "@/lib/brand";

/**
 * L'email du lien de connexion — le seul email système qui part
 * aujourd'hui. Écrit dans la langue de son DESTINATAIRE (`users.locale`,
 * sinon celle de son organisation, sinon le français), pas dans celle de
 * la requête : il n'y a pas de personne connectée au moment de l'envoi.
 * Remplace le modèle anglais d'Auth.js. Aux couleurs du produit : la
 * connexion reste Clozado (étape 3), l'email au nom de l'organisation
 * viendra avec les emails système de l'étape 5.
 */
export type MagicLinkEmail = { subject: string; text: string; html: string };

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export async function renderMagicLinkEmail(to: string, url: string): Promise<MagicLinkEmail> {
  const locale = await localeOfUser({ email: to });
  const t = await translatorFor(locale, "auth.magicLink");
  const product = PRODUCT_NAME;
  const color = DEFAULT_BRAND_PRIMARY;
  const safeUrl = escapeHtml(url);
  const html = `<!doctype html><html lang="${locale}"><body style="margin:0;padding:32px 16px;background:#f4f4f5;font-family:Helvetica,Arial,sans-serif;color:#18181b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;border:1px solid #e4e4e7">
<tr><td style="padding:28px 32px 8px;font-size:13px;font-weight:700;color:${color}">${escapeHtml(product)}</td></tr>
<tr><td style="padding:0 32px;font-size:20px;font-weight:600">${escapeHtml(t("heading"))}</td></tr>
<tr><td style="padding:12px 32px 0;font-size:15px;line-height:1.5;color:#3f3f46">${escapeHtml(t("intro", { product }))}</td></tr>
<tr><td style="padding:24px 32px"><a href="${safeUrl}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:${color};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none">${escapeHtml(t("button"))}</a></td></tr>
<tr><td style="padding:0 32px;font-size:13px;line-height:1.5;color:#71717a">${escapeHtml(t("fallback"))}<br><a href="${safeUrl}" style="color:${color};word-break:break-all">${safeUrl}</a></td></tr>
<tr><td style="padding:20px 32px 28px;font-size:13px;line-height:1.5;color:#71717a">${escapeHtml(t("ignore"))}</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: t("subject", { product }), text: t("text", { product, url }), html };
}
