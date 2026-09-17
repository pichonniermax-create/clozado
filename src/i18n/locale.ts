import { cache } from "react";
import { cookies } from "next/headers";
import { PRODUCT_FORMATS, type FormatSettings } from "@/lib/format";
import { readDemoVisitor } from "@/lib/demo/session";
import { ACTIVE_ORG_COOKIE, getSession } from "@/lib/session";
import { DEFAULT_LOCALE, type AppLocale } from "./locales";
import { localeOfUser, settingsOfOrganization } from "./locale-lookup";

export { localeOfOrganization, localeOfUser, settingsOfOrganization, timeZoneOfOrganization } from "./locale-lookup";

/**
 * Les réglages d'affichage de la REQUÊTE : la langue de la personne
 * connectée (son choix, sinon celle de son organisation, sinon le
 * français) ; la devise et le fuseau de l'organisation EFFECTIVE — la
 * sienne, ou celle qu'un super admin a choisie dans le bandeau (le même
 * cookie que `requireUser`), sinon ceux du produit. Les écrans publics —
 * connexion, inscription, vitrine de partage — n'ont pas de personne : ce
 * sont les réglages du produit (la vitrine demande ceux de l'organisation
 * émettrice, explicitement). Mise en cache par requête : la configuration
 * de next-intl, la coquille et les formats l'appellent tous.
 */
export const resolveRequestSettings = cache(async (): Promise<FormatSettings> => {
  // Un visiteur de la démo publique lit dans la langue, la devise et le fuseau de l'organisation de démo.
  const visitor = await readDemoVisitor().catch(() => null);
  if (visitor) return settingsOfOrganization(visitor.organizationId).catch(() => PRODUCT_FORMATS);
  // La même session mémoïsée que `requireUser` : une lecture par requête, pas une par appelant.
  const session = await getSession().catch(() => null);
  const user = session?.user;
  if (!user?.id) return PRODUCT_FORMATS;
  let organizationId = user.organizationId ?? null;
  if (user.role === "super_admin") {
    const store = await cookies().catch(() => null);
    organizationId = store?.get(ACTIVE_ORG_COOKIE)?.value ?? null;
  }
  // La langue de la personne et les réglages de l'organisation : deux lectures indépendantes, ensemble — sur le chemin
  // critique de CHAQUE page (la configuration de next-intl les attend avant de rendre quoi que ce soit).
  const [locale, org] = await Promise.all([
    localeOfUser({ id: user.id }).catch(() => DEFAULT_LOCALE),
    organizationId ? settingsOfOrganization(organizationId).catch(() => PRODUCT_FORMATS) : Promise.resolve(null),
  ]);
  if (!org) return { ...PRODUCT_FORMATS, locale };
  return { locale, currency: org.currency, timeZone: org.timeZone };
});

/** La langue de la requête — voir `resolveRequestSettings`. */
export const resolveRequestLocale = async (): Promise<AppLocale> => (await resolveRequestSettings()).locale;
