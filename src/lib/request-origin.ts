import { headers } from "next/headers";

/**
 * L'origine publique de la requête (« https://app.clozado.fr »), lue dans
 * les en-têtes que la plateforme pose — le produit n'a pas de variable
 * d'URL publique (docs/module-marque-blanche-i18n.md §4 : à décider avec
 * le domaine personnalisé, avec lequel l'origine dépendra de toute façon
 * de la requête). Sert aux adresses absolues : l'extrait de collecte, le
 * logo dans un email — lu hors du produit, une adresse relative n'y
 * mènerait nulle part.
 */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
