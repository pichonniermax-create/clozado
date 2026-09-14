import type { AppLocale } from "@/i18n/locales";
import { createFormats, PRODUCT_FORMATS } from "@/lib/format";
import { translatorFor } from "@/i18n/translator";
import { DEFAULT_BRAND_PRIMARY, PRODUCT_NAME } from "@/lib/brand";

/**
 * L'email d'INVITATION à créer un espace (docs/module-invitations.md §1.4)
 * — le second email système du produit, après le lien de connexion, et
 * bâti sur le même gabarit (src/lib/email/magic-link.ts) : aux couleurs du
 * produit, dans la LANGUE DE L'INVITATION (celle que le super admin a
 * choisie pour l'espace — il n'y a pas encore de personne à qui demander),
 * un bouton, le lien en clair en repli, la date d'expiration.
 */
export type InvitationEmail = { subject: string; text: string; html: string };

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export async function renderInvitationEmail(input: { locale: AppLocale; organizationName: string; url: string; expiresAt: Date }): Promise<InvitationEmail> {
  const t = await translatorFor(input.locale, "invitations.email");
  const fmt = createFormats({ ...PRODUCT_FORMATS, locale: input.locale });
  const product = PRODUCT_NAME;
  const color = DEFAULT_BRAND_PRIMARY;
  const safeUrl = escapeHtml(input.url);
  const values = { product, name: input.organizationName, date: fmt.date(input.expiresAt) };
  const html = `<!doctype html><html lang="${input.locale}"><body style="margin:0;padding:32px 16px;background:#f4f4f5;font-family:Helvetica,Arial,sans-serif;color:#18181b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;border:1px solid #e4e4e7">
<tr><td style="padding:28px 32px 8px;font-size:13px;font-weight:700;color:${color}">${escapeHtml(product)}</td></tr>
<tr><td style="padding:0 32px;font-size:20px;font-weight:600">${escapeHtml(t("heading", values))}</td></tr>
<tr><td style="padding:12px 32px 0;font-size:15px;line-height:1.5;color:#3f3f46">${escapeHtml(t("intro", values))}</td></tr>
<tr><td style="padding:24px 32px"><a href="${safeUrl}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:${color};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none">${escapeHtml(t("button"))}</a></td></tr>
<tr><td style="padding:0 32px;font-size:13px;line-height:1.5;color:#71717a">${escapeHtml(t("fallback"))}<br><a href="${safeUrl}" style="color:${color};word-break:break-all">${safeUrl}</a></td></tr>
<tr><td style="padding:20px 32px 28px;font-size:13px;line-height:1.5;color:#71717a">${escapeHtml(t("expires", values))}<br>${escapeHtml(t("ignore"))}</td></tr>
</table></td></tr></table></body></html>`;
  return {
    subject: t("subject", values),
    text: t("text", { ...values, url: input.url }),
    html,
  };
}
