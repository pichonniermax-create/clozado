import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { isReservedExampleAddress } from "@/lib/demo/constants";

/**
 * QUI reçoit un lien de connexion — les deux gardes d'Auth.js, sorties de
 * `src/auth.ts` pour être exercées hors requête (plan de stabilisation,
 * complément à l'étape 2) :
 *
 * 1. `isKnownSignInEmail` — le callback `signIn` : pas d'auto-inscription,
 *    une adresse absente de `users` n'obtient ni email ni session (Auth.js
 *    répond AccessDenied avant tout envoi ; l'écran montre la même page
 *    « vérifie ta boîte » pour ne rien dire à un inconnu).
 * 2. `magicLinkMayBeSentTo` — `sendVerificationRequest` : jamais d'email
 *    vers une adresse réservée aux exemples (RFC 2606 / 6761) — toutes les
 *    personas de la démo en portent une, et rien ne les route.
 *
 * Une organisation de démo n'a donc jamais qu'un seul chemin vers une
 * session : une ligne `users` à adresse RÉELLE, que seul un script pose
 * (`scripts/demo-member.ts`) — le visiteur de /demo n'a qu'un cookie de
 * visite signé, jamais une session Auth.js.
 */

/** Pure : un lien de connexion ne part jamais vers une adresse réservée aux exemples. */
export function magicLinkMayBeSentTo(identifier: string): boolean {
  return !isReservedExampleAddress(identifier);
}

/** Un compte existe-t-il pour cette adresse ? Tout le reste est refusé — pas d'auto-inscription. */
export async function isKnownSignInEmail(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  const existing = await db.query.users.findFirst({ where: eq(users.email, email), columns: { id: true } });
  return Boolean(existing);
}

/** Les deux gardes ensemble : ce qu'il faut pour qu'un lien parte (test-isolation l'exerce contre la base). */
export async function canReceiveMagicLink(email: string): Promise<boolean> {
  return magicLinkMayBeSentTo(email) && (await isKnownSignInEmail(email));
}
