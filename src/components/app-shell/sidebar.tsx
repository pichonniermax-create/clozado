import { NavigationList } from "@/components/app-shell/navigation-list";
import type { NavBadge } from "@/components/app-shell/navigation";
import { WorkspaceMark, type WorkspaceMarkProps } from "@/components/app-shell/workspace-mark";

/**
 * Navigation permanente du produit sur grand écran (dès `md`) ; en dessous,
 * la même liste vit dans le panneau replié de l'en-tête (`MobileNav`).
 *
 * La marque (chantier marque blanche, étape 3 — qui inverse, pour l'espace
 * de travail, la règle « identité Clozado seule » de la refonte) : la barre
 * porte le logo de l'organisation quand elle en a un, la marque du produit
 * sinon. Ses couleurs viennent des jetons dérivés que la coquille pose sur
 * le document (`BrandStyle`), jamais d'une couleur lue ici — c'était la
 * fuite relevée à l'inventaire de la refonte. Le nom de l'organisation
 * reste dans l'en-tête, comme un contexte.
 */
export function Sidebar({
  mark,
  hasOrganization,
  badges,
}: {
  mark: WorkspaceMarkProps;
  /** Faux en vue globale super admin : les écrans propres à une organisation sont masqués. */
  hasOrganization: boolean;
  badges: Record<NavBadge, number>;
}) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
      <div className="px-4 py-4">
        <WorkspaceMark {...mark} href="/dashboard" />
      </div>
      <NavigationList hasOrganization={hasOrganization} badges={badges} />
    </aside>
  );
}
