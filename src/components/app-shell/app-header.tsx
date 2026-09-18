import { signOut } from "@/auth";
import { AccountMenu } from "@/components/app-shell/account-menu";
import { CommandPalette } from "@/components/app-shell/command-palette";
import { DemoAccountLinks } from "@/components/demo/demo-account-links";
import { MobileNav } from "@/components/app-shell/mobile-nav";
import type { NavBadge } from "@/components/app-shell/navigation";
import { QuickCreateMenu } from "@/components/app-shell/quick-create-menu";
import type { WorkspaceMarkProps } from "@/components/app-shell/workspace-mark";
import { useTranslations } from "next-intl";
import { revalidatePath } from "next/cache";
import { updateUserLocale } from "@/db/queries/users";
import { isAppLocale, type AppLocale } from "@/i18n/locales";
import { requireSessionUser } from "@/lib/session";
import { setThemeAction } from "@/lib/shell/actions";
import type { Theme } from "@/lib/theme";

/**
 * L'en-tête des écrans internes — la coquille n'en avait pas (inventaire
 * §8) : ni recherche, ni actions rapides, ni menu de compte. Il porte le
 * CONTEXTE (dans quelle organisation on travaille — le nom, jamais la
 * marque du client), la PALETTE DE COMMANDES (⌘K : rechercher une fiche,
 * aller à un écran, créer — chantier UI/UX, à la place de la simple
 * recherche de contacts), le menu « Nouveau » et le compte. Collant en
 * haut : le bandeau super admin se range juste dessous. Sur petit écran,
 * il porte aussi le bouton qui ouvre la navigation repliée.
 */
export function AppHeader({
  mark,
  organizationName,
  hasOrganization,
  readOnly = false,
  isSuperAdmin = false,
  badges,
  hrefs,
  user,
}: {
  /** La marque du panneau de navigation replié — la même que la barre latérale. */
  mark: WorkspaceMarkProps;
  /** Nom de l'organisation dans laquelle on travaille — null en vue globale super admin. */
  organizationName: string | null;
  hasOrganization: boolean;
  /** Un visiteur de la démo publique : ni menu « Nouveau », ni menu de compte — des liens de sortie. */
  readOnly?: boolean;
  /** Le super admin réel : le panneau replié montre aussi l'espace gestionnaire. */
  isSuperAdmin?: boolean;
  /** Les compteurs de la navigation — le panneau replié les affiche comme la barre latérale. */
  badges: Record<NavBadge, number>;
  /** L'écran tel qu'on l'a laissé, par chemin (lot 1). */
  hrefs?: Record<string, string>;
  user: { name: string | null; email: string | null; localeChoice: AppLocale | null; theme: Theme };
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
    // Collant tant que la coquille ne l'est pas (sous md) ; au-dessus, c'est le bloc du haut qui colle,
    // d'un seul tenant avec les bandeaux — c'est lui que mesure `--shell-top`.
    <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur md:static md:z-auto md:gap-3 md:px-6">
      <MobileNav mark={mark} hasOrganization={hasOrganization} readOnly={readOnly} isSuperAdmin={isSuperAdmin} badges={badges} hrefs={hrefs} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {organizationName ?? <span className="text-muted-foreground">{t("vue_globale")}</span>}
        </p>
      </div>

      <CommandPalette hasOrganization={hasOrganization} readOnly={readOnly} isSuperAdmin={isSuperAdmin} />

      {hasOrganization && !readOnly && <QuickCreateMenu />}
      {readOnly ? (
        <DemoAccountLinks />
      ) : (
        <AccountMenu
          name={user.name}
          email={user.email}
          hasOrganization={hasOrganization}
          localeChoice={user.localeChoice}
          theme={user.theme}
          signOutAction={signOutAction}
          setLocaleAction={setLocaleAction}
          setThemeAction={setThemeAction}
        />
      )}
    </header>
  );
}
