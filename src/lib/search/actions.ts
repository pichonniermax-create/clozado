"use server";

import { searchEverything, type SearchHit } from "@/db/queries/search";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";

/**
 * La recherche de la palette de commandes (chantier UI/UX) : l'utilisateur
 * effectif (substitution du super admin comprise), son organisation, et
 * rien d'autre. Trois cents recherches par personne et par minute : une
 * frappe humaine avec délai n'en approche pas, un script en rafale si.
 */
export async function searchEverythingAction(query: string): Promise<SearchHit[]> {
  const user = await requireUser();
  if (!checkRateLimit(`search:user:${user.id}`, { limit: 300, windowMs: 60_000 })) return [];
  return searchEverything(user, String(query ?? ""));
}
