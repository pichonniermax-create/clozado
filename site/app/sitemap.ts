import type { MetadataRoute } from "next";
import { entreesDuSitemap } from "@/lib/metadata";

/** Écrit une fois, à la construction : l'export en fichiers ne connaît pas la requête. */
export const dynamic = "force-static";

/**
 * Le sitemap. Il ne déclare QUE les pages construites (`lib/routes.ts`) :
 * pas d'adresse promise qui rendrait 404. Chaque entrée porte ses
 * variantes de langue — sans effet aujourd'hui, juste avec l'anglais.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return entreesDuSitemap();
}
