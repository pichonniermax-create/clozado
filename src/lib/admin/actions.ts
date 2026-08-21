"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { ACTIVE_ORG_COOKIE, requireSessionUser } from "@/lib/session";

/**
 * Choix de l'organisation active d'un super admin (bandeau de la coquille).
 * `null` = revenir à la vue globale. Le choix survit aux sessions (un an).
 */
export async function setActiveOrganizationAction(orgId: string | null) {
  const user = await requireSessionUser();
  if (user.role !== "super_admin") {
    throw new Error("Réservé au super admin : un utilisateur n'a qu'une seule organisation.");
  }
  const store = await cookies();
  if (!orgId) {
    store.delete(ACTIVE_ORG_COOKIE);
    return;
  }
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, orgId) });
  if (!org) {
    throw new Error("Cette organisation n'existe pas ou plus — recharge la page et re-choisis.");
  }
  store.set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
