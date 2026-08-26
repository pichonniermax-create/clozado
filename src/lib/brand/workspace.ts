import { cache } from "react";
import type { Organization } from "@/db/schema";
import { listOrganizationAssetMeta, type AssetMeta } from "@/db/queries/organization-assets";
import { getOwnOrganization } from "@/db/queries/organizations";
import { DEFAULT_BRAND_PRIMARY } from "@/lib/brand";
import { requireUser } from "@/lib/session";
import { assetUrlsFromMeta } from "./assets";
import { normalizeHex } from "./color";
import { deriveBrandTokens, type BrandTokens } from "./derive";

/**
 * LA MARQUE DE L'ESPACE DE TRAVAIL (chantier marque blanche, étape 3) —
 * ce que la coquille pose sur l'application : les jetons dérivés de la
 * couleur de l'organisation (les deux thèmes) et les adresses versionnées
 * de ses images. Rien n'est stocké : tout est recalculé à chaque rendu de
 * la coquille depuis la couleur choisie, par la même fonction que l'aperçu
 * du sélecteur — l'aperçu ne peut pas mentir.
 */
export type WorkspaceBrand = {
  name: string;
  /** La couleur choisie, normalisée — ou la couleur par défaut du produit. */
  hex: string;
  light: BrandTokens;
  dark: BrandTokens;
  /** Les images téléversées (adresses relatives, versionnées) ; null quand elles n'existent pas — la marque par défaut s'affiche alors. */
  logo: { light: string | null; dark: string | null; icon: string | null };
};

export function workspaceBrand(org: Pick<Organization, "id" | "name" | "primaryColor">, meta: AssetMeta[]): WorkspaceBrand {
  const hex = normalizeHex(org.primaryColor ?? "") ?? DEFAULT_BRAND_PRIMARY;
  const urls = assetUrlsFromMeta(org.id, meta);
  return {
    name: org.name,
    hex,
    light: deriveBrandTokens(hex, "light").tokens,
    dark: deriveBrandTokens(hex, "dark").tokens,
    logo: { light: urls.logo_light ?? null, dark: urls.logo_dark ?? null, icon: urls.icon ?? null },
  };
}

export type Workspace = { organization: Organization; brand: WorkspaceBrand };

/**
 * L'organisation EFFECTIVE de la requête et sa marque — null en vue
 * globale super admin : l'espace gestionnaire reste Clozado. Une seule
 * lecture par requête (`cache` de React) : la coquille et ses métadonnées
 * (le titre et l'icône d'onglet) l'appellent toutes les deux.
 */
export const getWorkspace = cache(async (): Promise<Workspace | null> => {
  const user = await requireUser();
  if (!user.organizationId) return null;
  const [org, meta] = await Promise.all([getOwnOrganization(user), listOrganizationAssetMeta(user.organizationId)]);
  if (!org) return null;
  return { organization: org, brand: workspaceBrand(org, meta) };
});
