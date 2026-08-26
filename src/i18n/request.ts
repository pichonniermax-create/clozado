import { getRequestConfig } from "next-intl/server";
import { PRODUCT_TIMEZONE } from "@/lib/timezone";
import { resolveRequestLocale } from "./locale";
import { loadMessages } from "./messages";

/**
 * La configuration de next-intl pour chaque requête — sans langue dans
 * l'URL (docs/module-marque-blanche-i18n.md §2.3) : la langue est celle de
 * la personne, résolue ici, jamais celle de l'adresse. Le fuseau est
 * encore celui du produit ; il deviendra celui de l'organisation à
 * l'étape 5 avec les formats.
 */
export default getRequestConfig(async ({ locale: explicit }) => {
  const locale = explicit ?? (await resolveRequestLocale());
  return {
    locale,
    messages: await loadMessages(locale),
    timeZone: PRODUCT_TIMEZONE,
  };
});
