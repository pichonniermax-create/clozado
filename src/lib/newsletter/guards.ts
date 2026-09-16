import { assertOrgAccess } from "@/db/scope";
import { AppError } from "@/lib/errors";
import type { OrgScopeUser } from "@/lib/session";

/**
 * Les gardes d'isolation des newsletters, SORTIES des actions serveur pour
 * être testées sans session ni base (plan de stabilisation, S2 et S4) : une
 * action serveur exige `requireUser()` et n'est pas appelable d'un test —
 * ce qui décide du refus vit donc ici, et l'action ne fait qu'appeler.
 */

type Owned = { organizationId: string };

/**
 * S4 — la cible d'une newsletter : à la personne, la newsletter à la
 * personne, ET la cible à la newsletter. Les deux premières gardes
 * passent séparément pour un super admin en vue globale : sans la
 * troisième, une newsletter de A pouvait recevoir la cible de B
 * (`newsletters.target_id` n'a pas de FK composite). `newsletter` vaut
 * null à la création : la cible seule est vérifiée.
 */
export function assertTargetForNewsletter(user: OrgScopeUser, target: Owned, newsletter: Owned | null): void {
  assertOrgAccess(user, target.organizationId);
  if (!newsletter) return;
  assertOrgAccess(user, newsletter.organizationId);
  if (target.organizationId !== newsletter.organizationId) {
    throw new AppError("la_cible_et_la_newsletter_n_appartiennent_3901", undefined, 403);
  }
}

/**
 * S2 — l'envoi à reprendre : la newsletter D'ABORD, l'envoi ENSUITE.
 * `findLatestSend` ne connaît pas l'organisation ; appelé avant la garde,
 * il faisait varier l'erreur selon qu'une autre organisation avait un
 * envoi ouvert — un oracle d'existence. Ici il n'est jamais appelé pour
 * une newsletter qu'on n'a pas le droit de voir (ce que le test vérifie).
 */
export async function resolveSendToResume<Send extends { finishedAt: Date | null }>(
  user: OrgScopeUser,
  newsletterId: string,
  deps: {
    findNewsletter: (id: string) => Promise<Owned | null | undefined>;
    findLatestSend: (newsletterId: string) => Promise<Send | null>;
  }
): Promise<Send> {
  const newsletter = await deps.findNewsletter(newsletterId);
  if (!newsletter) throw new AppError("newsletter_introuvable", undefined, 404);
  assertOrgAccess(user, newsletter.organizationId);
  const send = await deps.findLatestSend(newsletterId);
  if (!send || send.finishedAt) throw new AppError("cet_envoi_est_termine");
  return send;
}
