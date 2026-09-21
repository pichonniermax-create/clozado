import { articles } from "@/lib/articles";
import { getDictionary, HTML_LANG, isLocale, LOCALES } from "@/lib/i18n";
import { url } from "@/lib/routes";

/**
 * LE FLUX RSS DU BLOG — écrit AU BUILD, servi comme un fichier.
 *
 * `force-static` : cette route ne s'exécute jamais à la requête, elle est
 * rendue une fois et posée sur le CDN comme les pages. Le site tient donc
 * sa règle — rien ne tourne à la demande — tout en publiant un vrai flux.
 */
export const dynamic = "force-static";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

/** Les cinq caractères que XML n'admet pas tels quels. */
function echappe(texte: string): string {
  return texte
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Une date RFC 822, celle qu'attend RSS — à midi UTC, l'heure n'étant pas connue. */
function rfc822(iso: string): string {
  const [annee, mois, jour] = iso.split("-").map(Number);
  return new Date(Date.UTC(annee, mois - 1, jour, 12)).toUTCString();
}

export async function GET(_requete: Request, contexte: { params: Promise<{ locale: string }> }) {
  const { locale: brut } = await contexte.params;
  const locale = isLocale(brut) ? brut : LOCALES[0];
  const { blog } = getDictionary(locale);
  const adresse = url(locale, "blog");
  const liste = articles();

  const items = liste
    .map((article) => {
      const lien = `${adresse}/${article.slug}`;
      return [
        "    <item>",
        `      <title>${echappe(article.titre)}</title>`,
        `      <link>${lien}</link>`,
        `      <guid isPermaLink="true">${lien}</guid>`,
        `      <category>${echappe(article.categorie)}</category>`,
        `      <pubDate>${rfc822(article.publie)}</pubDate>`,
        `      <description>${echappe(article.resume)}</description>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  const flux = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${echappe(blog.flux.titre)}</title>`,
    `    <link>${adresse}</link>`,
    `    <description>${echappe(blog.flux.description)}</description>`,
    `    <language>${HTML_LANG[locale]}</language>`,
    `    <atom:link href="${adresse}/rss.xml" rel="self" type="application/rss+xml" />`,
    ...(liste.length > 0 ? [`    <lastBuildDate>${rfc822(liste[0].publie)}</lastBuildDate>`] : []),
    items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");

  return new Response(flux, {
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
  });
}
