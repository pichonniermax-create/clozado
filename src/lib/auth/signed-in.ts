import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

/**
 * Une personne déjà connectée n'a rien à faire sur les écrans de connexion
 * et d'inscription : son espace (stabilisation, P8). La session Auth.js
 * seule — une visite de la démo se termine en entrant ici (proxy), elle ne
 * compte pas. Appelée depuis le LAYOUT du segment, pas depuis la page : la
 * page est rendue derrière `loading.tsx` (Suspense), et une redirection qui
 * part de là n'est qu'une instruction au navigateur dans un 200 — depuis le
 * layout, c'est une vraie 307, vue par une requête HTTP nue.
 */
export async function redirectIfSignedIn(destination: string): Promise<void> {
  const session = await getSession();
  if (session?.user) redirect(destination);
}
