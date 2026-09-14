/**
 * L'ADRESSE IP du client, pour les clés de limitation de débit (constat S8
 * de l'audit) — une seule lecture pour les cinq points d'entrée publics.
 *
 * Derrière Vercel (`VERCEL=1`), `x-real-ip` : la plateforme le pose
 * elle-même et écrase ce que le client aurait écrit. Partout ailleurs — une
 * préprod Docker, un autre hébergeur — cet en-tête vaut ce que le client
 * veut : on lit alors le DERNIER élément de `x-forwarded-for`, le seul écrit
 * par le mandataire le plus proche de nous (chaque mandataire y AJOUTE
 * l'adresse qui lui parle ; le premier élément, c'est le client qui l'écrit).
 * Sans en-tête : une valeur fixe, pour que la clé existe quand même (le
 * limiteur agrège alors tout le monde, plutôt que personne). Sans aucun
 * mandataire devant le serveur, rien n'est fiable — la limite est celle du
 * déploiement, pas de cette lecture.
 */
export function clientIp(headers: { get(name: string): string | null }, trustRealIp = process.env.VERCEL === "1"): string {
  if (trustRealIp) {
    const real = headers.get("x-real-ip")?.trim();
    if (real) return real;
  }
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return "unknown";
}
