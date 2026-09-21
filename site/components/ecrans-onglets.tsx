import type { ReactNode } from "react";

/**
 * LES TROIS ÉCRANS DU PREMIER PLAN, sous des onglets qui tournent.
 *
 * Rendu au build, première vue active, sans une ligne de React dans le
 * navigateur : `public/comportements.js` fait tourner le cycle, écoute les
 * flèches, et anime la vue qui devient visible.
 *
 * Le cycle existe pour dire qu'il y a TROIS écrans à voir : sans lui, deux
 * restent invisibles à qui ne clique pas. Il s'arrête DÉFINITIVEMENT dès
 * que la personne prend la main — un clic, une entrée de souris, ou un
 * focus au clavier : à partir de là, c'est elle qui choisit, et rien ne
 * doit plus bouger sous ses yeux.
 *
 * Les vues sont EMPILÉES dans la même case de grille : la hauteur est celle
 * de la plus haute, donc rien ne saute pendant le fondu. Les vues cachées
 * le sont par `visibility`, ce qui les retire aussi des lecteurs d'écran et
 * du parcours au clavier.
 *
 * SANS JAVASCRIPT, la liste d'onglets n'est pas affichée (CSS conditionné
 * par `[data-mouvement]`) : une rangée de boutons morts serait un piège au
 * clavier. La première vue reste seule, et la page se lit entière.
 *
 * LES CLASSES DES DEUX ÉTATS voyagent dans le balisage (`data-classe`,
 * `data-classe-active`) : le script échange un attribut, il n'écrit aucune
 * classe de sa poche — les noms restent là où ils sont écrits.
 */
type Vue = { readonly cle: string; readonly libelle: string; readonly contenu: ReactNode };

const ONGLET =
  "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-muted-foreground transition-colors duration-200 ease-out hover:text-foreground";
const ONGLET_ACTIF =
  "inline-flex min-h-11 items-center rounded-full bg-primary-soft px-4 text-sm font-semibold text-primary-ink transition-colors duration-200 ease-out";

export function EcransOnglets({
  vues,
  libelleListe,
  identifiant = "ecrans",
}: {
  vues: readonly Vue[];
  libelleListe: string;
  /** Il nomme les onglets et leurs vues : deux constructions donnent le même HTML. */
  identifiant?: string;
}) {
  return (
    <div data-onglets>
      <div role="tablist" aria-label={libelleListe} className="liste-onglets">
        {vues.map((vue, rang) => (
          <button
            key={vue.cle}
            type="button"
            role="tab"
            id={`${identifiant}-onglet-${rang}`}
            aria-selected={rang === 0}
            aria-controls={`${identifiant}-vue-${rang}`}
            tabIndex={rang === 0 ? 0 : -1}
            data-classe={ONGLET}
            data-classe-active={ONGLET_ACTIF}
            className={rang === 0 ? ONGLET_ACTIF : ONGLET}
          >
            {vue.libelle}
          </button>
        ))}
      </div>

      <div className="pile-vues">
        {vues.map((vue, rang) => (
          <div
            key={vue.cle}
            role="tabpanel"
            id={`${identifiant}-vue-${rang}`}
            aria-labelledby={`${identifiant}-onglet-${rang}`}
            data-actif={rang === 0 ? "oui" : "non"}
            className="vue"
          >
            {vue.contenu}
          </div>
        ))}
      </div>
    </div>
  );
}
