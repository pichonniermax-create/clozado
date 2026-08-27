import type { Organization } from "@/db/schema";
import { translatorFor } from "@/i18n/translator";
import type { AppLocale } from "@/i18n/locales";
import { PRODUCT_NAME } from "@/lib/brand";
import type { RenderFooter } from "@/lib/newsletter/render-email";
import { footerProfileOf } from "./footer-profiles";

export type FooterOrganization = Pick<Organization, "name" | "country" | "postalAddress" | "legalMention" | "privacyPolicyUrl">;

/**
 * LE PIED DE PAGE d'un email au nom d'une organisation, dans SA langue :
 * le profil de son pays dit quelles lignes s'imposent, ses faits les
 * remplissent, les phrases viennent des messages (`email.footer`). Une
 * seule fonction pour la newsletter, l'email de test et — plus tard — les
 * emails des règles : ils ne peuvent pas différer.
 */
export async function buildFooter(
  org: FooterOrganization,
  locale: AppLocale,
  urls: { unsubscribeUrl: string },
  options: { test?: boolean } = {}
): Promise<RenderFooter> {
  const t = await translatorFor(locale, "email.footer");
  const profile = footerProfileOf(org);
  const privacyUrl = org.privacyPolicyUrl?.trim() || null;
  return {
    why: t("why", { organization: org.name }),
    unsubscribeLabel: t("unsubscribe"),
    unsubscribeUrl: urls.unsubscribeUrl,
    unsubscribeDelay: profile.unsubscribeHonoredWithinDays ? t("unsubscribe_delay", { days: profile.unsubscribeHonoredWithinDays }) : null,
    postalAddress: org.postalAddress?.trim() || null,
    legalMention: org.legalMention?.trim() || null,
    tracking: profile.mentionsTracking ? t("tracking") : null,
    privacyLabel: privacyUrl ? t("privacy") : null,
    privacyUrl,
    testNotice: options.test ? t("test_notice", { product: PRODUCT_NAME }) : null,
  };
}

/** Ce qui manque à l'organisation pour qu'un email puisse partir — le profil de son pays en décide ; vide = tout y est. */
export function missingFooterFacts(org: FooterOrganization): ("postal_address")[] {
  const profile = footerProfileOf(org);
  const missing: ("postal_address")[] = [];
  if (profile.requiresPostalAddress && !org.postalAddress?.trim()) missing.push("postal_address");
  return missing;
}
