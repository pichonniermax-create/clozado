import type { Organization } from "@/db/schema";

/**
 * LE PROFIL DE PIED DE PAGE PAR PAYS — des données, dans le code (comme
 * les packs métier) : ce qu'un email commercial doit porter selon le pays
 * de l'expéditeur. Les FAITS (adresse postale, mentions, politique de
 * confidentialité) vivent sur l'organisation ; les RÈGLES vivent ici, et
 * tout passe par `footerProfileOf` — le jour du chantier multi-marchés,
 * ce résolveur lira une table `markets` au lieu du pays, et rien d'autre
 * ne changera (docs/module-engagement.md §2.4).
 *
 * Pas un avis juridique : des profils à relire — écrits pour qu'on puisse
 * les relire.
 */
export type FooterProfile = {
  key: string;
  /** L'adresse postale de l'expéditeur est obligatoire au pied de l'email. */
  requiresPostalAddress: boolean;
  /** Le pied de page dit que l'email mesure les ouvertures et les clics. */
  mentionsTracking: boolean;
  /** Le délai de prise en compte de la désinscription annoncé (en jours) ; null = « immédiate ». */
  unsubscribeHonoredWithinDays: number | null;
};

const EU: FooterProfile = { key: "eu", requiresPostalAddress: true, mentionsTracking: true, unsubscribeHonoredWithinDays: null };

const PROFILES: Record<string, FooterProfile> = {
  // Union européenne et assimilés : identification de l'expéditeur, adresse, désinscription, mention de la mesure.
  eu: EU,
  // Suisse (LCD art. 3 al. 1 let. o) : identification correcte de l'expéditeur et possibilité de refus — mêmes lignes.
  ch: { key: "ch", requiresPostalAddress: true, mentionsTracking: true, unsubscribeHonoredWithinDays: null },
  // Royaume-Uni (PECR) : identification et désinscription ; l'adresse postale reste exigée par le profil.
  gb: { key: "gb", requiresPostalAddress: true, mentionsTracking: true, unsubscribeHonoredWithinDays: null },
  // Canada (LCAP) : adresse postale obligatoire, désinscription honorée sous dix jours ouvrables.
  ca: { key: "ca", requiresPostalAddress: true, mentionsTracking: true, unsubscribeHonoredWithinDays: 10 },
  // États-Unis (CAN-SPAM) : adresse postale obligatoire, désinscription honorée sous dix jours ouvrables.
  us: { key: "us", requiresPostalAddress: true, mentionsTracking: true, unsubscribeHonoredWithinDays: 10 },
};

/** Les pays de l'Union européenne et de l'Espace économique européen suivent le profil européen. */
const EU_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "MC", "AD", "SM", "VA",
]);

/** Le profil d'une organisation depuis son pays ; NULL ou inconnu = le profil européen (le plus exigeant des profils courants). */
export function footerProfileOf(org: Pick<Organization, "country">): FooterProfile {
  const country = org.country?.trim().toUpperCase() ?? "";
  if (!country || EU_COUNTRIES.has(country)) return EU;
  return PROFILES[country.toLowerCase()] ?? EU;
}
