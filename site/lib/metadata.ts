import type { Metadata } from "next";
import { getDictionary, HTML_LANG, LOCALES, OG_LOCALE, type Locale } from "./i18n";
import { path, ROUTES, url, type RouteKey } from "./routes";
import { SITE_CONFIG } from "./site-config";

/**
 * LES MÉTADONNÉES D'UNE PAGE, construites au même endroit pour toutes :
 * titre, description, adresse canonique, `hreflang` de chaque langue, et
 * l'image de partage.
 *
 * L'adresse canonique pointe TOUJOURS le domaine final (`clozado.fr`),
 * même pendant que le site vit sur une adresse Vercel provisoire : les
 * moteurs n'indexent donc pas la copie provisoire.
 *
 * Les `hreflang` sont déjà posés avec une seule langue — c'est sans effet
 * aujourd'hui et sans rien à écrire le jour où l'anglais arrive. Le
 * `x-default` désigne la langue par défaut.
 *
 * LE SUFFIXE DE MARQUE est appliqué ICI, jamais par le gabarit de titre de
 * la coquille : un gabarit déclaré dans un `layout` ne s'applique PAS au
 * `page` du MÊME segment (documentation de Next 16) — l'accueil, qui vit
 * dans le segment de la coquille racine, perdait donc « — Clozado » alors
 * que les pages métier l'auraient eu. Une seule règle, le même résultat à
 * toutes les profondeurs, et le titre complet aussi dans la carte de
 * partage.
 */
export function pageMetadata({
  locale,
  route,
  titre,
  description,
}: {
  locale: Locale;
  route: RouteKey;
  titre: string;
  description: string;
}): Metadata {
  const { common } = getDictionary(locale);
  const canonique = url(locale, route);

  const languages: Record<string, string> = {};
  for (const autre of LOCALES) languages[HTML_LANG[autre]] = url(autre, route);
  languages["x-default"] = url(LOCALES[0], route);

  const titreComplet = common.meta.gabaritDeTitre.replace("%s", titre);

  return {
    metadataBase: new URL(SITE_CONFIG.origin),
    title: { absolute: titreComplet },
    description,
    alternates: { canonical: canonique, languages },
    openGraph: {
      type: "website",
      siteName: common.meta.nomDuSite,
      locale: OG_LOCALE[locale],
      url: canonique,
      title: titreComplet,
      description,
    },
    twitter: { card: "summary_large_image", title: titreComplet, description },
  };
}

/**
 * Les données structurées de l'éditeur et du produit, posées une fois dans
 * la coquille. `Organization` décrit l'éditeur ; `SoftwareApplication`
 * décrit le produit. Aucune note, aucun avis, aucun prix tant qu'ils ne
 * sont pas décidés : un balisage qui ment est pénalisé.
 */
export function donneesStructurees(locale: Locale) {
  const { common } = getDictionary(locale);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_CONFIG.origin}/#organisation`,
        name: common.marque,
        url: SITE_CONFIG.origin,
        description: common.pied.presentation,
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_CONFIG.origin}/#produit`,
        name: common.marque,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: `${SITE_CONFIG.origin}${path(locale, "accueil")}`,
        description: common.pied.presentation,
        publisher: { "@id": `${SITE_CONFIG.origin}/#organisation` },
        inLanguage: HTML_LANG[locale],
      },
    ],
  };
}

/** Les pages construites, pour le sitemap : leur adresse, leurs variantes de langue et leur priorité. */
export function entreesDuSitemap() {
  return (Object.keys(ROUTES) as RouteKey[])
    .filter((cle) => ROUTES[cle].built)
    .flatMap((cle) =>
      LOCALES.map((locale) => {
        const languages: Record<string, string> = {};
        for (const autre of LOCALES) languages[HTML_LANG[autre]] = url(autre, cle);
        return {
          url: url(locale, cle),
          priority: ROUTES[cle].priority,
          alternates: { languages },
        };
      })
    );
}
