/**
 * L'ÉTAT d'une invitation à créer un espace, calculé — jamais stocké
 * (docs/module-invitations.md §1.1) : « utilisée » l'emporte sur tout
 * (l'espace existe), puis « révoquée » (un geste explicite), puis
 * « expirée » (le temps), sinon « en attente ». Pure : la liste, la
 * résolution publique et les tests la partagent.
 */
export type InvitationStatus = "en_attente" | "utilisee" | "expiree" | "revoquee";

export function invitationStatus(row: { usedAt: Date | null; revokedAt: Date | null; expiresAt: Date }, now = new Date()): InvitationStatus {
  if (row.usedAt) return "utilisee";
  if (row.revokedAt) return "revoquee";
  if (row.expiresAt.getTime() <= now.getTime()) return "expiree";
  return "en_attente";
}
