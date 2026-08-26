import { cache } from "react";
import { auth } from "@/auth";
import { DEFAULT_LOCALE, type AppLocale } from "./locales";
import { localeOfUser } from "./locale-lookup";

export { localeOfOrganization, localeOfUser } from "./locale-lookup";

/**
 * La langue de la REQUÊTE : celle de la personne connectée, sinon le
 * français (les écrans publics — connexion, inscription, vitrine de
 * partage — n'ont pas de personne ; la vitrine pourra demander celle de
 * l'organisation émettrice par `getTranslations({ locale })`). Mise en
 * cache par requête : la configuration de next-intl et la coquille
 * l'appellent toutes les deux.
 */
export const resolveRequestLocale = cache(async (): Promise<AppLocale> => {
  const session = await auth().catch(() => null);
  const id = session?.user?.id;
  if (!id) return DEFAULT_LOCALE;
  return localeOfUser({ id }).catch(() => DEFAULT_LOCALE);
});
