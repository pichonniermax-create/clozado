"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { ACTIVE_ORG_COOKIE, requireSessionUser } from "@/lib/session";
import { AppError } from "@/lib/errors";

/**
 * Choix de l'organisation active d'un super admin (bandeau de la coquille).
 * `null` = revenir à la vue globale. Le choix survit aux sessions (un an).
 */
export async function setActiveOrganizationAction(orgId: string | null) {
  const user = await requireSessionUser();
  if (user.role !== "super_admin") {
    throw new AppError("reserve_au_super_admin_un_utilisateur_n_8405");
  }
  const store = await cookies();
  if (!orgId) {
    store.delete(ACTIVE_ORG_COOKIE);
    return;
  }
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, orgId) });
  if (!org) {
    throw new AppError("cette_organisation_n_existe_pas_ou_plus_2126");
  }
  store.set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
