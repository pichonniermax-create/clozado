"use client";

import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { BrandMark } from "@/components/app-shell/brand-mark";
import { NavigationList } from "@/components/app-shell/navigation-list";
import type { NavBadge } from "@/components/app-shell/navigation";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/**
 * La navigation repliée des petits écrans : un bouton dans l'en-tête ouvre
 * la même liste que la barre latérale dans un panneau à gauche, par-dessus
 * l'écran. Il se referme à Échap, au clic en dehors, d'un glissement vers
 * le bord — et quand on navigue : le panneau est remonté à chaque
 * changement d'URL (`key`), donc toujours fermé sur l'écran d'arrivée,
 * sans état à synchroniser.
 */
export function MobileNav({
  hasOrganization,
  badges,
}: {
  hasOrganization: boolean;
  badges: Record<NavBadge, number>;
}) {
  const pathname = usePathname();

  return (
    <Sheet key={pathname}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Ouvrir la navigation" />
        }
      >
        <Menu />
      </SheetTrigger>
      <SheetContent className="flex w-72 max-w-[85vw] flex-col bg-sidebar p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <div className="px-4 py-4">
          <BrandMark href="/dashboard" />
        </div>
        <NavigationList hasOrganization={hasOrganization} badges={badges} />
      </SheetContent>
    </Sheet>
  );
}
