import { Sidebar } from "@/components/app-shell/sidebar";
import { getFollowUpBoard } from "@/db/queries/deal-follow-up";
import { getOwnOrganization } from "@/db/queries/organizations";
import { requireUser } from "@/lib/session";

/**
 * Coquille commune à tous les écrans internes. Le groupe de routes `(app)`
 * ne change aucune URL (`/dashboard` reste `/dashboard`) : il sert
 * uniquement à ce que ces écrans-là partagent une navigation, et à ce que
 * les écrans publics — `/partage/[token]`, `/login` — n'en héritent
 * surtout pas.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  const org = await getOwnOrganization(user);

  // Le compteur de la barre latérale. Sur /suivi, le tableau est donc
  // calculé deux fois pour une même requête (ici et dans la page) : c'est
  // assumé — trois requêtes indexées sur de petites tables, contre le fait
  // de voir « ce qu'il reste à traiter » depuis n'importe quel écran. À
  // revoir si ces tables grossissent vraiment.
  const board = user.organizationId ? await getFollowUpBoard(user) : null;
  const followUpCount = board
    ? board.pendingAlerts.length + board.acceptedStale.length + board.unpaidCommissions.length
    : 0;

  return (
    <div className="flex min-h-screen">
      <Sidebar
        org={org}
        userEmail={user.email ?? null}
        userName={user.name ?? null}
        isSuperAdmin={!user.organizationId}
        followUpCount={followUpCount}
      />
      <main className="min-w-0 flex-1">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
