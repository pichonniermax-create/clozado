import type { Organization } from "@/db/schema";
import { resolveRenderBrand } from "@/db/queries/newsletters";
import { buildFooter } from "@/lib/email/footer";
import { UNSUBSCRIBE_PLACEHOLDER, type SendContent } from "@/lib/email/deliver";
import { renderNewsletterHtml, renderNewsletterText } from "@/lib/newsletter/render-email";
import type { AnyBlock } from "@/lib/newsletter/blocks";
import type { AppLocale } from "@/i18n/locales";

/**
 * Le rendu d'un email de règle (automatique ou brouillon) : LE MÊME CHEMIN
 * que tout le reste — la marque de l'organisation, un bloc de texte, le
 * pied de page conforme avec le marqueur de désinscription substitué par
 * message à la remise. « Rien ne part sans » (Partie 1) vaut pour les
 * emails de règle aussi.
 */
export async function ruleEmailRenderer(
  org: Organization,
  origin: string,
  locale: AppLocale
): Promise<(subject: string, bodyText: string) => SendContent> {
  const [brand, footer] = await Promise.all([
    resolveRenderBrand(org, origin),
    buildFooter(org, locale, { unsubscribeUrl: UNSUBSCRIBE_PLACEHOLDER }, { test: false }),
  ]);
  return (subject, bodyText) => {
    const input = {
      brand,
      subject,
      preheader: "",
      blocks: [{ type: "texte", text: bodyText } as AnyBlock],
      signatory: null,
      footer,
      lang: locale,
    };
    return { html: renderNewsletterHtml(input), text: renderNewsletterText(input) };
  };
}
