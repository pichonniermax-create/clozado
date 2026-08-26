import type { AppLocale } from "./locales";
import type { Messages } from "./messages";

/**
 * Le typage de next-intl : les clés de `t("…")` sont vérifiées contre le
 * français à la compilation — une clé absente est une erreur de build,
 * pas un « contacts.list.titre » affiché à l'écran.
 */
declare module "next-intl" {
  interface AppConfig {
    Locale: AppLocale;
    Messages: Messages;
  }
}
