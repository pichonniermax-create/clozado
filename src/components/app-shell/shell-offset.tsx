"use client";

import { useEffect } from "react";

/**
 * LE DÉCALAGE DU HAUT, en une seule variable (`--shell-top`).
 *
 * La coquille empile en haut, et de façon variable : l'en-tête (toujours),
 * le bandeau de la démo, l'avis de visite périmée, le bandeau du super
 * admin — et chacun peut se replier sur deux lignes selon la largeur. La
 * barre latérale, elle, est collante et doit commencer EXACTEMENT sous cet
 * empilement : sinon sa première entrée passe dessous et se fait couper
 * (défaut signalé sur `/dashboard`, panneau déplié).
 *
 * D'où une mesure réelle, pas un nombre recopié : on observe la hauteur du
 * bloc collant du haut et on l'écrit sur le document. Tout ce qui doit s'y
 * aligner lit la même variable — la barre, son panneau, et la hauteur qui
 * leur reste. Un `ResizeObserver` suit les changements (largeur, bandeau
 * qui apparaît, texte qui se replie) sans jamais provoquer de rendu React.
 *
 * Avant l'hydratation, la variable vaut ce que le serveur a posé en ligne
 * (l'en-tête, plus le bandeau s'il est rendu) : pas de saut à l'arrivée.
 */
export function ShellOffset({ targetId }: { targetId: string }) {
  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return;
    const apply = () => {
      const height = Math.round(target.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--shell-top", `${height}px`);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(target);
    window.addEventListener("resize", apply);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, [targetId]);
  return null;
}
