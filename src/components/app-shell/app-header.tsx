import { Search } from "lucide-react";
import { signOut } from "@/auth";
import { AccountMenu } from "@/components/app-shell/account-menu";
import { MobileNav } from "@/components/app-shell/mobile-nav";
import type { NavBadge } from "@/components/app-shell/navigation";
import { QuickCreateMenu } from "@/components/app-shell/quick-create-menu";
import { Input } from "@/components/ui/input";

/**
 * L'en-tête des écrans internes — la coquille n'en avait pas (inventaire
 * §8) : ni recherche, ni actions rapides, ni menu de compte. Il porte le
 * CONTEXTE (dans quelle organisation on travaille — le nom, jamais la
 * marque du client), la recherche de contacts, le menu « Nouveau » et le
 * compte. Collant en haut : le bandeau super admin se range juste dessous.
 * Sur petit écran, il porte aussi le bouton qui ouvre la navigation repliée.
 */
export function AppHeader({
  organizationName,
  hasOrganization,
  badges,
  user,
}: {
  /** Nom de l'organisation dans laquelle on travaille — null en vue globale super admin. */
  organizationName: string | null;
  hasOrganization: boolean;
  /** Les compteurs de la navigation — le panneau replié les affiche comme la barre latérale. */
  badges: Record<NavBadge, number>;
  user: { name: string | null; email: string | null };
}) {
  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur md:gap-3 md:px-6">
      <MobileNav hasOrganization={hasOrganization} badges={badges} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {organizationName ?? <span className="text-muted-foreground">Vue globale</span>}
        </p>
      </div>

      <form action="/contacts" method="get" role="search" className="hidden md:block">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            name="q"
            placeholder="Rechercher un contact…"
            aria-label="Rechercher un contact"
            className="w-64 pl-8"
          />
        </div>
      </form>

      {hasOrganization && <QuickCreateMenu />}
      <AccountMenu
        name={user.name}
        email={user.email}
        hasOrganization={hasOrganization}
        signOutAction={signOutAction}
      />
    </header>
  );
}
