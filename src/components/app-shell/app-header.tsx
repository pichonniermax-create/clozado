import { Search } from "lucide-react";
import { signOut } from "@/auth";
import { AccountMenu } from "@/components/app-shell/account-menu";
import { MobileNav } from "@/components/app-shell/mobile-nav";
import type { NavBadge } from "@/components/app-shell/navigation";
import { QuickCreateMenu } from "@/components/app-shell/quick-create-menu";
import type { WorkspaceMarkProps } from "@/components/app-shell/workspace-mark";
import { Input } from "@/components/ui/input";
import { useTranslations } from "next-intl";
import { revalidatePath } from "next/cache";
import { updateUserLocale } from "@/db/queries/users";
import { isAppLocale, type AppLocale } from "@/i18n/locales";
import { requireSessionUser } from "@/lib/session";

/**
 * L'en-tête des écrans internes — la coquille n'en avait pas (inventaire
 * §8) : ni recherche, ni actions rapides, ni menu de compte. Il porte le
 * CONTEXTE (dans quelle organisation on travaille — le nom, jamais la
 * marque du client), la recherche de contacts, le menu « Nouveau » et le
 * compte. Collant en haut : le bandeau super admin se range juste dessous.
 * Sur petit écran, il porte aussi le bouton qui ouvre la navigation repliée.
 */
export function AppHeader({
  mark,
  organizationName,
  hasOrganization,
  badges,
  user,
}: {
  /** La marque du panneau de navigation replié — la même que la barre latérale. */
  mark: WorkspaceMarkProps;
  /** Nom de l'organisation dans laquelle on travaille — null en vue globale super admin. */
  organizationName: string | null;
  hasOrganization: boolean;
  /** Les compteurs de la navigation — le panneau replié les affiche comme la barre latérale. */
  badges: Record<NavBadge, number>;
  user: { name: string | null; email: string | null; localeChoice: AppLocale | null };
}) {
  const t = useTranslations("shell.appHeader");
  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }
  // La langue de la personne : la sienne, mémorisée — ou vide pour suivre celle de l'organisation. Toute la coquille change de langue : revalidation entière.
  async function setLocaleAction(formData: FormData) {
    "use server";
    const value = String(formData.get("locale") ?? "");
    const sessionUser = await requireSessionUser();
    await updateUserLocale(sessionUser.id, isAppLocale(value) ? value : null);
    revalidatePath("/", "layout");
  }

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur md:gap-3 md:px-6">
      <MobileNav mark={mark} hasOrganization={hasOrganization} badges={badges} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {organizationName ?? <span className="text-muted-foreground">{t("vue_globale")}</span>}
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
            placeholder={t("rechercher_un_contact")}
            aria-label={t("rechercher_un_contact_938c")}
            className="w-64 pl-8"
          />
        </div>
      </form>

      {hasOrganization && <QuickCreateMenu />}
      <AccountMenu
        name={user.name}
        email={user.email}
        hasOrganization={hasOrganization}
        localeChoice={user.localeChoice}
        signOutAction={signOutAction}
        setLocaleAction={setLocaleAction}
      />
    </header>
  );
}
