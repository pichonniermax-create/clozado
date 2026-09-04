import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";

/**
 * « Cette organisation est-elle la démo ? » — LA question que posent le
 * transport email (docs/module-demo.md §1.2), les collectes de veille et
 * d'indicateurs (§1.3) et le lien de connexion, avant de faire quoi que ce
 * soit qui sorte du produit. Une lecture par clé primaire, à chaque fois :
 * la réponse ne se met jamais en cache d'une requête à l'autre, pour
 * qu'un marquage posé en base soit respecté à la requête suivante.
 * Une organisation inconnue vaut « non » : le garde-fou ne doit pas
 * changer le sort d'un envoi ordinaire.
 */
export async function isDemoOrganization(organizationId: string | null | undefined): Promise<boolean> {
  if (!organizationId) return false;
  const rows = await db.select({ isDemo: organizations.isDemo }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  return rows[0]?.isDemo === true;
}
