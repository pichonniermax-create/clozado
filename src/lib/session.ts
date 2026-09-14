import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { readDemoVisitor } from "@/lib/demo/session";
import { AppError } from "@/lib/errors";

/**
 * LA SESSION Auth.js, UNE FOIS PAR REQUÊTE (audit, constat D4) : chaque
 * `auth()` rejoue le callback `jwt`, qui relit la personne en base — et la
 * coquille, ses métadonnées, la page, les formats et la langue l'appelaient
 * chacun (cinq à huit lectures identiques par écran). `cache` de React la
 * mémoïse pour la durée du rendu ; les routes et actions, hors rendu,
 * l'appellent normalement.
 */
export const getSession = cache(async () => auth());

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
 * L'utilisateur de session BRUT (rôle réel, sans substitution), ou null
 * quand personne n'est connecté. LA SESSION DE VISITE d'abord, fermée par
 * défaut : quand le cookie de la démo publique est là et valide, c'est
 * elle qui gagne — même si une vraie session coexiste (quitter la démo la
 * rend). Voir docs/module-demo.md §1.4.
 */
async function readSessionUser(): Promise<SessionUser | null> {
  const visitor = await readDemoVisitor();
  if (visitor) return visitor.user;
  const session = await getSession();
  if (!session?.user) return null;
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
 * L'utilisateur de session BRUT, ou la redirection vers la connexion.
 * Réservé à la coquille : le bandeau super admin a besoin de savoir qui est
 * VRAIMENT connecté, pas dans quelle organisation il travaille.
 */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await readSessionUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * LA SUBSTITUTION du super admin : s'il a choisi une organisation (bandeau
 * en haut de l'écran, cookie `clozado-active-org`), il agit comme un admin
 * de cette organisation — toutes les requêtes org-scopées (orgScope) et
 * toutes les actions du produit en tiennent compte sans qu'aucun écran
 * n'ait à connaître le mécanisme. Sans organisation choisie, il garde son
 * rôle réel : vues globales en lecture, et les gestes qui exigent une
 * organisation le lui disent honnêtement.
 *
 * Le cookie n'est lu QUE pour un super admin : un utilisateur normal qui le
 * forgerait n'obtient rien (son rôle ne passe jamais par cette branche).
 */
async function withActiveOrganization(user: SessionUser): Promise<SessionUser> {
  if (user.role !== "super_admin") return user;
  const store = await cookies();
  const activeOrgId = store.get(ACTIVE_ORG_COOKIE)?.value;
  if (!activeOrgId) return user;
  return { ...user, role: "admin" as const, organizationId: activeOrgId };
}

/**
 * À utiliser en haut de toute page et action protégée : l'utilisateur
 * EFFECTIF (session ou visite, substitution du super admin comprise), ou la
 * redirection vers la connexion.
 */
export async function requireUser(): Promise<SessionUser> {
  return withActiveOrganization(await requireSessionUser());
}

/**
 * La même chose pour une ROUTE API (audit, constat Q5) : une route répond
 * en JSON, elle ne redirige pas — sans session, une `AppError` 401 que la
 * route sérialise. Même utilisateur effectif que les écrans, substitution
 * du super admin comprise : un même geste ne se comporte plus autrement
 * selon qu'il passe par une action ou par une route.
 */
export async function requireApiUser(): Promise<SessionUser> {
  const user = await readSessionUser();
  if (!user) throw new AppError("connexion_requise", undefined, 401);
  return withActiveOrganization(user);
}
