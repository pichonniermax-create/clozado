import { redirect } from "next/navigation";
import { auth } from "@/auth";

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
