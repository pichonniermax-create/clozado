import { AppHeader } from "@/components/app-shell/app-header";
import { Sidebar } from "@/components/app-shell/sidebar";
import { SuperAdminBar } from "@/components/app-shell/super-admin-bar";
import { getFollowUpBoard } from "@/db/queries/deal-follow-up";
import { getOwnOrganization, getVisibleOrganizations } from "@/db/queries/organizations";
import { countTasksDueNow } from "@/db/queries/tasks";
import { requireSessionUser, requireUser } from "@/lib/session";

/**
 * Coquille commune à tous les écrans internes. Le groupe de routes `(app)`
 * ne change aucune URL (`/dashboard` reste `/dashboard`) : il sert
 * uniquement à ce que ces écrans-là partagent une navigation et un en-tête,
 * et à ce que les écrans publics — `/partage/[token]`, `/login` — n'en
 * héritent surtout pas.
 *
 * Deux identités cohabitent ici : l'utilisateur de SESSION (qui est
 * vraiment connecté — le menu de compte et le bandeau super admin en
 * dépendent) et l'utilisateur EFFECTIF (dans quelle organisation il
 * travaille — tout le reste en dépend). Pour un utilisateur normal, ce sont
 * les mêmes.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const sessionUser = await requireSessionUser();
  const user = await requireUser();
  const isSuperAdmin = sessionUser.role === "super_admin";
  const hasOrganization = Boolean(user.organizationId);

  const [org, allOrganizations] = await Promise.all([
    getOwnOrganization(user),
    isSuperAdmin ? getVisibleOrganizations(sessionUser) : Promise.resolve([]),
  ]);

  // Les compteurs de la barre latérale. Sur /suivi, le tableau est donc
  // calculé deux fois pour une même requête (ici et dans la page) : c'est
  // assumé — trois requêtes indexées sur de petites tables, contre le fait
  // de voir « ce qu'il reste à traiter » depuis n'importe quel écran. À
  // revoir si ces tables grossissent vraiment.
  const [board, tasksDue] =
    hasOrganization && org
      ? await Promise.all([getFollowUpBoard(user), countTasksDueNow(user)])
      : [null, 0];
  const followUp = board
    ? board.pendingAlerts.length + board.acceptedStale.length + board.unpaidCommissions.length
    : 0;

  return (
    <div className="flex min-h-screen">
      <Sidebar hasOrganization={hasOrganization} badges={{ followUp, tasksDue }} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          organizationName={org?.name ?? null}
          hasOrganization={hasOrganization}
          badges={{ followUp, tasksDue }}
          user={{ name: sessionUser.name ?? null, email: sessionUser.email ?? null }}
        />
        {isSuperAdmin && (
          <SuperAdminBar
            organizations={allOrganizations.map((o) => ({ id: o.id, name: o.name, slug: o.slug }))}
            activeOrgId={user.organizationId}
          />
        )}
        <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
