import { eq } from "drizzle-orm";
import type { Session } from "next-auth";
import { db } from "@/db";
import { organizations } from "@/db/schema";

/**
 * Garde-fou d'isolation, LE modèle à reproduire pour toute future requête
 * métier : un super_admin voit tout, tout autre utilisateur ne voit jamais
 * que les données de sa propre organisation.
 */
export async function getVisibleOrganizations(user: Session["user"]) {
  if (user.role === "super_admin") {
    return db.select().from(organizations);
  }

  if (!user.organizationId) {
    // Ne devrait jamais arriver (contrainte en base) : filet de sécurité.
    return [];
  }

  return db
    .select()
    .from(organizations)
    .where(eq(organizations.id, user.organizationId));
}
