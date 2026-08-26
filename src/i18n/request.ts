import { getRequestConfig } from "next-intl/server";
import { resolveRequestSettings } from "./locale";
import { loadMessages } from "./messages";

/**
 * La configuration de next-intl pour chaque requête — sans langue dans
 * l'URL (docs/module-marque-blanche-i18n.md §2.3) : la langue est celle de
 * la personne, résolue ici, jamais celle de l'adresse ; le fuseau est celui
 * de l'organisation effective (les dates passées en argument d'un message
 * se rendent dedans).
 */
export default getRequestConfig(async ({ locale: explicit }) => {
  const settings = await resolveRequestSettings();
  const locale = explicit ?? settings.locale;
  return {
    locale,
    messages: await loadMessages(locale),
    timeZone: settings.timeZone,
  };
});
