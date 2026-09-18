import { RailNav } from "@/components/app-shell/rail-nav";
import type { NavBadge } from "@/components/app-shell/navigation";
import { WorkspaceMark, type WorkspaceMarkProps } from "@/components/app-shell/workspace-mark";

/**
 * Navigation permanente du produit sur grand écran (dès `md`) ; en dessous,
 * la même liste vit dans le panneau plein écran de la barre du bas
 * (`BottomNav`) et du bouton de l'en-tête (`MobileNav`).
 *
 * Depuis le lot 4, ce n'est plus une colonne de 256 px : un RAIL de 56 px
 * (une icône par groupe, plus les écrans épinglés) et un panneau qui se
 * déplie. L'épingle le garde ouvert pour qui préférait l'ancienne barre.
 *
 * La marque (chantier marque blanche, étape 3) : le rail porte le logo de
 * l'organisation quand elle en a un, la marque du produit sinon. Ses
 * couleurs viennent des jetons dérivés posés sur le document
 * (`BrandStyle`), jamais d'une couleur lue ici. Le nom de l'organisation,
 * lui, ne s'écrit qu'à UN endroit : l'en-tête (ou, pour un super admin, son
 * bandeau) — lot 4.
 */
export function Sidebar({
  mark,
  hasOrganization,
  readOnly = false,
  isSuperAdmin = false,
  badges,
  hrefs,
  pinned,
  favorites,
}: {
  mark: WorkspaceMarkProps;
  /** Faux en vue globale super admin : les écrans propres à une organisation sont masqués. */
  hasOrganization: boolean;
  /** Un visiteur de la démo publique : pas de lien vers les réglages. */
  readOnly?: boolean;
  /** Le super admin réel : les écrans de l'espace gestionnaire. */
  isSuperAdmin?: boolean;
  badges: Record<NavBadge, number>;
  /** L'écran tel qu'on l'a laissé, par chemin (lot 1). */
  hrefs?: Record<string, string>;
  /** La barre reste dépliée (préférence de la personne, lot 4). */
  pinned: boolean;
  /** Les écrans épinglés en haut du rail (lot 4). */
  favorites: string[];
}) {
  return (
    <RailNav
      // Rendue par le serveur et passée en propriété : le rail est un composant client, la marque n'a pas à l'être.
      mark={<WorkspaceMark {...mark} href="/dashboard" compact />}
      hasOrganization={hasOrganization}
      readOnly={readOnly}
      isSuperAdmin={isSuperAdmin}
      badges={badges}
      hrefs={hrefs}
      pinned={pinned}
      favorites={favorites}
    />
  );
}
