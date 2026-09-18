"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookUser, Briefcase, LayoutDashboard, ListTodo, MailPlus, Menu, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { NavBadge } from "@/components/app-shell/navigation";
import { NavigationList } from "@/components/app-shell/navigation-list";
import { WorkspaceMark, type WorkspaceMarkProps } from "@/components/app-shell/workspace-mark";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type Tab = {
  href: string;
  key: "dashboard" | "contacts" | "affaires" | "taches" | "invitations";
  icon: LucideIcon;
  badge?: NavBadge;
  requiresOrganization?: boolean;
  /** En vue globale du super admin réel seulement : sans organisation, la barre ne se réduit pas à « Accueil + Menu ». */
  superAdminOnly?: boolean;
};

/** Les quatre destinations du pouce : le tableau de bord, les deux dossiers du quotidien, les tâches. Le reste vit derrière « Menu ». */
const TABS: Tab[] = [
  { href: "/dashboard", key: "dashboard", icon: LayoutDashboard },
  { href: "/contacts", key: "contacts", icon: BookUser, requiresOrganization: true },
  { href: "/affaires", key: "affaires", icon: Briefcase, requiresOrganization: true },
  { href: "/taches", key: "taches", icon: ListTodo, badge: "tasksDue", requiresOrganization: true },
  { href: "/invitations", key: "invitations", icon: MailPlus, superAdminOnly: true },
];

/**
 * LA BARRE D'ONGLETS des petits écrans (chantier UI/UX, responsive) — la
 * convention des applications mobiles (HubSpot, Monday…) : les écrans du
 * quotidien sous le pouce, en bas, toujours visibles ; le panneau complet
 * de navigation derrière « Menu » (la même liste que la barre latérale, la
 * même feuille que le bouton de l'en-tête). Masquée dès `md`, où la barre
 * latérale reprend. La zone de sécurité des téléphones à encoche est
 * respectée (`safe-area-inset-bottom`).
 */
export function BottomNav({
  mark,
  hasOrganization,
  readOnly = false,
  isSuperAdmin = false,
  badges,
  hrefs,
}: {
  mark: WorkspaceMarkProps;
  hasOrganization: boolean;
  readOnly?: boolean;
  isSuperAdmin?: boolean;
  badges: Record<NavBadge, number>;
  /** L'écran tel qu'on l'a laissé, par chemin (lot 1). */
  hrefs?: Record<string, string>;
}) {
  const t = useTranslations("shell.bottomNav");
  const tn = useTranslations("nav");
  const pathname = usePathname();
  const tabs = TABS.filter((tab) => (hasOrganization || !tab.requiresOrganization) && (!tab.superAdminOnly || (isSuperAdmin && !hasOrganization)));

  return (
    <nav
      aria-label={t("navigation_principale")}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="flex items-stretch justify-around">
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const badge = tab.badge ? badges[tab.badge] : 0;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={hrefs?.[tab.href] ?? tab.href}
                // Pas de préchargement à l'affichage (voir NavLink) : sur un téléphone, il n'y a pas de survol — le clic charge, le squelette s'affiche.
                prefetch={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-14 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium",
                  active ? "text-primary-ink" : "text-muted-foreground"
                )}
              >
                <tab.icon className="size-5" aria-hidden />
                {/* Un mot par onglet : « Accueil » plutôt que « Tableau de bord » en 11 px collé aux bords. */}
                <span className="truncate">{tab.key === "dashboard" || tab.key === "invitations" ? tn(`tabs.${tab.key}`) : tn(`entries.${tab.key}`)}</span>
                {badge > 0 && (
                  <span className="absolute top-1.5 left-1/2 ml-1.5 min-w-4 rounded-full bg-primary px-1 text-center text-[0.625rem] leading-4 font-semibold text-primary-foreground tabular-nums">
                    {badge}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
        <li className="flex-1">
          <Sheet key={pathname}>
            <SheetTrigger
              render={
                <button
                  type="button"
                  className="flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium text-muted-foreground"
                  aria-label={t("menu")}
                />
              }
            >
              <Menu className="size-5" aria-hidden />
              <span>{t("menu")}</span>
            </SheetTrigger>
            <SheetContent className="flex w-72 max-w-[85vw] flex-col bg-sidebar p-0">
              <SheetTitle className="sr-only">{t("navigation_principale")}</SheetTitle>
              <div className="px-4 py-4">
                <WorkspaceMark {...mark} href="/dashboard" />
              </div>
              <NavigationList hasOrganization={hasOrganization} readOnly={readOnly} isSuperAdmin={isSuperAdmin} badges={badges} hrefs={hrefs} />
            </SheetContent>
          </Sheet>
        </li>
      </ul>
    </nav>
  );
}
