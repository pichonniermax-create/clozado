import type { SessionUser } from "@/lib/session";

/**
 * LE RESPONSABLE PAR DÉFAUT d'une fiche, d'une affaire ou d'une tâche que
 * l'on crée (audit UX du 2026-09-17, constat 7) : la personne connectée
 * quand elle appartient à l'organisation — le cas normal, inchangé — ;
 * sinon (un super admin en substitution, qui n'est membre d'aucune
 * organisation par construction) l'admin LE PLUS ANCIEN de l'organisation,
 * parce que c'est le seul qui existe dans tout espace : l'inscription le
 * crée, et c'est lui qui montre le produit. Sans admin, personne — et le
 * formulaire le dit.
 *
 * Avant : le formulaire proposait l'identifiant du super admin, absent de
 * la liste des conseillers ; le sélecteur retombait sur « Personne » et,
 * dans un espace à un seul utilisateur, le champ caché envoyait un
 * identifiant hors organisation que le serveur refusait.
 */
export type OwnerCandidate = { id: string; role: "super_admin" | "admin" | "member"; createdAt: Date };

export function defaultOwnerId(user: Pick<SessionUser, "id">, orgUsers: readonly OwnerCandidate[]): string | null {
  if (orgUsers.some((u) => u.id === user.id)) return user.id;
  const admins = orgUsers.filter((u) => u.role === "admin").sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return admins[0]?.id ?? null;
}
