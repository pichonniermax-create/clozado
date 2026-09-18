import type { MetadataRoute } from "next";
import { SITE_CONFIG } from "@/lib/site-config";

/**
 * Tout est indexable : le site n'a rien de privé. L'adresse Vercel
 * provisoire ne se fait pas indexer pour autant — chaque page porte une
 * balise canonique vers `clozado.fr`.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_CONFIG.origin}/sitemap.xml`,
    host: SITE_CONFIG.origin,
  };
}
