import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { readDemoVisitor } from "@/lib/demo/session";

/**
 * Ce dont a besoin le garde-fou d'isolation pour scoper une requête —
 * volontairement minimal (pas tout le type Session d'Auth.js), pour que
 * la couche base de données ne dépende pas du système d'auth utilisé.
 */
export type OrgScopeUser = {
  role: "super_admin" | "admin" | "member";
  organizationId: string | null;
  /**
   * Un visiteur de la démo publique (docs/module-demo.md §1.4) : le proxy
   * refuse ses écritures, et les travaux déclenchés à la visite (journal
   * d'accès, tâches automatiques) ne s'exécutent pas pour lui.
   */
  readOnly?: boolean;
};

/** Ce que la coquille et les actions savent de la personne connectée — une session Auth.js ou une visite de la démo. */
export type SessionUser = {
  id: string;
  email: string | null;
  name: string | null;
  role: "super_admin" | "admin" | "member";
  organizationId: string | null;
  readOnly: boolean;
};

/** Cookie qui mémorise l'organisation dans laquelle un super admin travaille — d'un écran ET d'une session à l'autre. */
export const ACTIVE_ORG_COOKIE = "clozado-active-org";

/**
 * L'utilisateur de session BRUT (rôle réel, sans substitution).
 * Réservé à la coquille : le bandeau super admin a besoin de savoir qui est
 * VRAIMENT connecté, pas dans quelle organisation il travaille.
 */
export async function requireSessionUser(): Promise<SessionUser> {
  // LA SESSION DE VISITE d'abord, fermée par défaut : quand le cookie de la
  // démo publique est là et valide, c'est elle qui gagne — même si une vraie
  // session coexiste (quitter la démo la rend). Voir docs/module-demo.md §1.4.
  const visitor = await readDemoVisitor();
  if (visitor) return visitor.user;
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  return {
    id: session.user.id,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    role: session.user.role,
    organizationId: session.user.organizationId,
    readOnly: false,
  };
}

/**
 * À utiliser en haut de toute page/route/action protégée : l'utilisateur
 * EFFECTIF. Pour un admin/membre, c'est l'utilisateur de session tel quel.
 * Pour un super admin qui a choisi une organisation (bandeau en haut de
 * l'écran, cookie `clozado-active-org`), c'est LA SUBSTITUTION : il agit
 * comme un admin de cette organisation — toutes les requêtes org-scopées
 * (orgScope) et toutes les actions du produit en tiennent compte sans
 * qu'aucun écran n'ait à connaître le mécanisme.
 *
 * Sans organisation choisie, le super admin garde son rôle réel : vues
 * globales en lecture, et les gestes qui exigent une organisation le lui
 * disent honnêtement.
 *
 * Le cookie n'est lu QUE pour un super admin : un utilisateur normal qui le
 * forgerait n'obtient rien (son rôle ne passe jamais par cette branche).
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await requireSessionUser();
  if (user.role === "super_admin") {
    const store = await cookies();
    const activeOrgId = store.get(ACTIVE_ORG_COOKIE)?.value;
    if (activeOrgId) {
      return { ...user, role: "admin" as const, organizationId: activeOrgId };
    }
  }
  return user;
}
