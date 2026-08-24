import { Sidebar } from "@/components/app-shell/sidebar";
import { SuperAdminBar } from "@/components/app-shell/super-admin-bar";
import { getFollowUpBoard } from "@/db/queries/deal-follow-up";
import { getOwnOrganization, getVisibleOrganizations } from "@/db/queries/organizations";
import { countTasksDueNow } from "@/db/queries/tasks";
import { requireSessionUser, requireUser } from "@/lib/session";

/**
 * Coquille commune à tous les écrans internes. Le groupe de routes `(app)`
 * ne change aucune URL (`/dashboard` reste `/dashboard`) : il sert
 * uniquement à ce que ces écrans-là partagent une navigation, et à ce que
 * les écrans publics — `/partage/[token]`, `/login` — n'en héritent
 * surtout pas.
 *
 * Deux identités cohabitent ici : l'utilisateur de SESSION (qui est
 * vraiment connecté — le bandeau super admin en dépend) et l'utilisateur
 * EFFECTIF (dans quelle organisation il travaille — tout le reste en
 * dépend). Pour un utilisateur normal, ce sont les mêmes.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const sessionUser = await requireSessionUser();
  const user = await requireUser();
  const isSuperAdmin = sessionUser.role === "super_admin";

  const [org, allOrganizations] = await Promise.all([
    getOwnOrganization(user),
    isSuperAdmin ? getVisibleOrganizations(sessionUser) : Promise.resolve([]),
  ]);

  // Le compteur de la barre latérale. Sur /suivi, le tableau est donc
  // calculé deux fois pour une même requête (ici et dans la page) : c'est
  // assumé — trois requêtes indexées sur de petites tables, contre le fait
  // de voir « ce qu'il reste à traiter » depuis n'importe quel écran. À
  // revoir si ces tables grossissent vraiment.
  const [board, tasksDueCount] =
    user.organizationId && org
      ? await Promise.all([getFollowUpBoard(user), countTasksDueNow(user)])
      : [null, 0];
  const followUpCount = board
    ? board.pendingAlerts.length + board.acceptedStale.length + board.unpaidCommissions.length
    : 0;

  return (
    <div className="flex min-h-screen">
      <Sidebar
        org={org}
        userEmail={sessionUser.email ?? null}
        userName={sessionUser.name ?? null}
        isSuperAdmin={!user.organizationId}
        followUpCount={followUpCount}
        tasksDueCount={tasksDueCount}
      />
      <main className="min-w-0 flex-1">
        {isSuperAdmin && (
          <SuperAdminBar
            organizations={allOrganizations.map((o) => ({ id: o.id, name: o.name, slug: o.slug }))}
            activeOrgId={user.organizationId}
          />
        )}
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
