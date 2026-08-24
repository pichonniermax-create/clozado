import {
  BookUser,
  Briefcase,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Mail,
  Settings,
  Target,
  Users,
} from "lucide-react";
import { signOut } from "@/auth";
import { NavLink } from "@/components/app-shell/nav-link";
import { Button } from "@/components/ui/button";

export type SidebarOrg = {
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
};

/**
 * Navigation permanente du produit. Elle remplace les liens « ← Retour au
 * tableau de bord » que chaque écran portait en propre : avec eux, toute
 * la navigation passait par un aller-retour au centre, et aucun écran ne
 * disait où l'on se trouvait dans l'ensemble.
 *
 * Regroupée par intention, pas par table : « Aujourd'hui » (ce qu'il y a à
 * faire) avant « Dossiers » (la matière), les outils annexes en dernier.
 */
export function Sidebar({
  org,
  userEmail,
  userName,
  isSuperAdmin,
  followUpCount,
  tasksDueCount,
}: {
  org: SidebarOrg | null;
  userEmail: string | null;
  userName: string | null;
  isSuperAdmin: boolean;
  /** Total des trois piles d'action de l'écran de suivi. */
  followUpCount: number;
  /** Tâches ouvertes en retard ou du jour — le « à faire maintenant » de l'écran des tâches. */
  tasksDueCount: number;
}) {
  const initials = (org?.name ?? "Clozado")
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Marque de l'organisation : c'est son outil, pas le nôtre. */}
      <div className="flex items-center gap-2.5 px-4 py-4">
        {org?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={org.logoUrl}
            alt={org.name}
            className="h-8 max-w-32 object-contain object-left"
          />
        ) : (
          <>
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
              style={{ backgroundColor: org?.primaryColor || "var(--primary)" }}
            >
              {initials}
            </span>
            <span className="truncate text-sm font-semibold">{org?.name ?? "Clozado"}</span>
          </>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-2">
        <NavSection label="Aujourd'hui">
          <NavLink href="/dashboard" label="Tableau de bord" icon={<LayoutDashboard />} />
          {/* Les tâches, le suivi et les réglages sont propres à une
              organisation : un super_admin n'en a pas, l'entrée mènerait à
              un écran qui ne peut rien afficher. Les écrans se défendent
              quand même tout seuls si on y arrive par l'URL. */}
          {!isSuperAdmin && (
            <NavLink href="/taches" label="Tâches" icon={<ListTodo />} badge={tasksDueCount} />
          )}
          {!isSuperAdmin && (
            <NavLink href="/suivi" label="Suivi" icon={<Target />} badge={followUpCount} />
          )}
        </NavSection>

        <NavSection label="Dossiers">
          <NavLink href="/contacts" label="Contacts" icon={<BookUser />} />
          <NavLink href="/affaires" label="Affaires" icon={<Briefcase />} />
          <NavLink href="/partenaires" label="Partenaires" icon={<Users />} />
        </NavSection>

        <NavSection label="Outils">
          <NavLink href="/newsletters" label="Newsletters" icon={<Mail />} />
        </NavSection>
      </nav>

      <div className="flex flex-col gap-1 border-t border-sidebar-border px-3 py-3">
        {!isSuperAdmin && (
          <NavLink href="/settings" label="Marque & réglages" icon={<Settings />} />
        )}
        <div className="flex items-center justify-between gap-2 px-3 pt-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">{userName ?? "Mon compte"}</p>
            <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button
              type="submit"
              variant="ghost"
              size="icon-sm"
              aria-label="Se déconnecter"
              title="Se déconnecter"
            >
              <LogOut />
            </Button>
          </form>
        </div>
      </div>
    </aside>
  );
}

function NavSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="px-3 pb-1 text-[0.6875rem] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      {children}
    </div>
  );
}
