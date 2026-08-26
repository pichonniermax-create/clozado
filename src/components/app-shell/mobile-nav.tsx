"use client";

import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { NavigationList } from "@/components/app-shell/navigation-list";
import type { NavBadge } from "@/components/app-shell/navigation";
import { WorkspaceMark, type WorkspaceMarkProps } from "@/components/app-shell/workspace-mark";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useTranslations } from "next-intl";

/**
 * La navigation repliée des petits écrans : un bouton dans l'en-tête ouvre
 * la même liste que la barre latérale dans un panneau à gauche, par-dessus
 * l'écran. Il se referme à Échap, au clic en dehors, d'un glissement vers
 * le bord — et quand on navigue : le panneau est remonté à chaque
 * changement d'URL (`key`), donc toujours fermé sur l'écran d'arrivée,
 * sans état à synchroniser. Le panneau se rend en portail, hors de la
 * coquille : c'est pour lui (entre autres) que les jetons de marque sont
 * posés sur le document entier et non sur la coquille.
 */
export function MobileNav({
  mark,
  hasOrganization,
  badges,
}: {
  mark: WorkspaceMarkProps;
  hasOrganization: boolean;
  badges: Record<NavBadge, number>;
}) {
  const t = useTranslations("shell.mobileNav");
  const pathname = usePathname();

  return (
    <Sheet key={pathname}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="md:hidden" aria-label={t("ouvrir_la_navigation")} />
        }
      >
        <Menu />
      </SheetTrigger>
      <SheetContent className="flex w-72 max-w-[85vw] flex-col bg-sidebar p-0">
        <SheetTitle className="sr-only">{t("navigation")}</SheetTitle>
        <div className="px-4 py-4">
          <WorkspaceMark {...mark} href="/dashboard" />
        </div>
        <NavigationList hasOrganization={hasOrganization} badges={badges} />
      </SheetContent>
    </Sheet>
  );
}
