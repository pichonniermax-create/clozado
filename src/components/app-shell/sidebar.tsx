import { BrandMark } from "@/components/app-shell/brand-mark";
import { NavigationList } from "@/components/app-shell/navigation-list";
import type { NavBadge } from "@/components/app-shell/navigation";

/**
 * Navigation permanente du produit sur grand écran (dès `md`) ; en dessous,
 * la même liste vit dans le panneau replié de l'en-tête (`MobileNav`).
 *
 * Identité Clozado seule (décision de la refonte, étape 3) : la barre ne
 * porte plus le logo ni la couleur du client — c'était la marque d'un
 * client qui teintait l'interface de l'application, exactement ce que le
 * chantier interdit. Le nom de l'organisation vit dans l'en-tête, comme un
 * contexte, pas comme une marque ; la marque du client ne s'affiche que
 * sur la vitrine de partage et dans les emails.
 */
export function Sidebar({
  hasOrganization,
  badges,
}: {
  /** Faux en vue globale super admin : les écrans propres à une organisation sont masqués. */
  hasOrganization: boolean;
  badges: Record<NavBadge, number>;
}) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <div className="px-4 py-4">
        <BrandMark href="/dashboard" />
      </div>
      <NavigationList hasOrganization={hasOrganization} badges={badges} />
    </aside>
  );
}
