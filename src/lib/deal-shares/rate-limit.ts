/**
 * Limiteur de débit en mémoire pour la route publique par jeton.
 *
 * LIMITE HONNÊTE, À LIRE AVANT D'EN DÉPENDRE : cette Map vit dans le
 * processus d'UNE instance serverless. Sur Vercel, chaque instance peut
 * être froide/recréée et le trafic peut être réparti sur plusieurs
 * instances en parallèle — ce compteur n'est PAS partagé entre elles.
 * Il ralentit un script naïf qui tape la même instance en rafale ; il ne
 * protège PAS contre un attaquant qui distribue ses requêtes. Pour une
 * garantie réelle, il faudrait un compteur centralisé (Postgres ou
 * Redis/Upstash) — pas construit ici, à décider si besoin.
 *
 * Ceci dit, la défense principale contre le brute-force n'est PAS ce
 * limiteur : c'est l'entropie du jeton lui-même (256 bits — même à un
 * milliard de requêtes/seconde, deviner un jeton reste hors de portée).
 * Ce limiteur sert à limiter l'abus/la charge, pas à rendre l'énumération
 * "juste assez lente" — elle est déjà infaisable par construction.
 */

type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

/**
 * true si la requête est autorisée (et compte pour la fenêtre courante),
 * false si la limite est dépassée. `key` typiquement : `ip:<adresse>` et/ou
 * `token:<hash>`, appelés séparément pour cumuler les deux angles de limite.
 */
export function checkRateLimit(
  key: string,
  { limit, windowMs }: { limit: number; windowMs: number }
): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (bucket.count >= limit) {
    return false;
  }

  bucket.count += 1;
  return true;
}
