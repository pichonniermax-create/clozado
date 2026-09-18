"use client";

import { useEffect, useId, useRef, useState } from "react";
import { animeZone } from "@/lib/mouvement";

/**
 * LES TROIS ÉCRANS DU PREMIER PLAN, sous des onglets qui tournent.
 *
 * Le cycle existe pour dire qu'il y a TROIS écrans à voir : sans lui, deux
 * restent invisibles à qui ne clique pas. Il s'arrête DÉFINITIVEMENT dès
 * que la personne prend la main — un clic, une entrée de souris, ou un
 * focus au clavier : à partir de là, c'est elle qui choisit, et rien ne
 * doit plus bouger sous ses yeux.
 *
 * Il ne démarre pas du tout si le système demande moins de mouvement : la
 * première vue reste affichée, les onglets marchent toujours.
 *
 * Les vues sont EMPILÉES dans la même case de grille : la hauteur est celle
 * de la plus haute, donc rien ne saute pendant le fondu. Les vues cachées
 * le sont par `visibility`, ce qui les retire aussi des lecteurs d'écran et
 * du parcours au clavier.
 */
type Vue = { readonly cle: string; readonly libelle: string; readonly contenu: React.ReactNode };

export function EcransOnglets({ vues, libelleListe }: { vues: readonly Vue[]; libelleListe: string }) {
  const [actif, setActif] = useState(0);
  const [cycleArrete, setCycleArrete] = useState(false);
  const identifiant = useId();
  const panneaux = useRef<(HTMLDivElement | null)[]>([]);
  const onglets = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (cycleArrete) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const minuteur = window.setInterval(() => setActif((rang) => (rang + 1) % vues.length), 5000);
    return () => window.clearInterval(minuteur);
  }, [cycleArrete, vues.length]);

  // La vue qui devient visible s'anime — `animeZone` ne le fait qu'une fois.
  useEffect(() => {
    const zone = panneaux.current[actif]?.querySelector<HTMLElement>("[data-ecran]");
    if (zone) animeZone(zone);
  }, [actif]);

  const choisir = (rang: number) => {
    setActif(rang);
    setCycleArrete(true);
  };

  /** Les flèches parcourent les onglets, comme l'attend le motif « tablist ». */
  const auClavier = (evenement: React.KeyboardEvent) => {
    const nombre = vues.length;
    const cible =
      evenement.key === "ArrowRight"
        ? (actif + 1) % nombre
        : evenement.key === "ArrowLeft"
          ? (actif - 1 + nombre) % nombre
          : evenement.key === "Home"
            ? 0
            : evenement.key === "End"
              ? nombre - 1
              : null;
    if (cible === null) return;
    evenement.preventDefault();
    choisir(cible);
    onglets.current[cible]?.focus();
  };

  return (
    <div data-onglets onMouseEnter={() => setCycleArrete(true)} onFocus={() => setCycleArrete(true)}>
      <div
        role="tablist"
        aria-label={libelleListe}
        onKeyDown={auClavier}
        className="liste-onglets"
      >
        {vues.map((vue, rang) => (
          <button
            key={vue.cle}
            type="button"
            role="tab"
            id={`${identifiant}-onglet-${rang}`}
            aria-selected={rang === actif}
            aria-controls={`${identifiant}-vue-${rang}`}
            tabIndex={rang === actif ? 0 : -1}
            ref={(element) => {
              onglets.current[rang] = element;
            }}
            onClick={() => choisir(rang)}
            className={
              rang === actif
                ? "inline-flex min-h-11 items-center rounded-full bg-primary-soft px-4 text-sm font-semibold text-primary-ink transition-colors duration-200 ease-out"
                : "inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-muted-foreground transition-colors duration-200 ease-out hover:text-foreground"
            }
          >
            {vue.libelle}
          </button>
        ))}
      </div>

      <div className="pile-vues">
        {vues.map((vue, rang) => (
          <div
            key={vue.cle}
            ref={(element) => {
              panneaux.current[rang] = element;
            }}
            role="tabpanel"
            id={`${identifiant}-vue-${rang}`}
            aria-labelledby={`${identifiant}-onglet-${rang}`}
            data-actif={rang === actif ? "oui" : "non"}
            className="vue"
          >
            {vue.contenu}
          </div>
        ))}
      </div>
    </div>
  );
}
