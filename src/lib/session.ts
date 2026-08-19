import { redirect } from "next/navigation";
import { auth } from "@/auth";

/**
 * Ce dont a besoin le garde-fou d'isolation pour scoper une requête —
 * volontairement minimal (pas tout le type Session d'Auth.js), pour que
 * la couche base de données ne dépende pas du système d'auth utilisé.
 */
export type OrgScopeUser = {
  role: "super_admin" | "admin" | "member";
  organizationId: string | null;
};

/**
 * À utiliser en haut de toute page/route protégée : renvoie l'utilisateur
 * connecté (avec rôle + organisation) ou redirige vers /login.
 */
export async function requireUser() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return session.user;
}
