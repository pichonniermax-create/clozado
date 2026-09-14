"use client";

import { useEffect, useRef } from "react";

/**
 * Affiche un fragment de HTML email tel quel, dans un shadow root.
 *
 * Pourquoi un shadow root et pas un `<iframe sandbox>` : l'aperçu N'EST PLUS
 * une vignette, c'est le document sur lequel on clique. Un iframe en sandbox
 * vide interdit à la fois le clic et la mesure. Pourquoi pas non plus un
 * simple `<div dangerouslySetInnerHTML>` : le reset CSS de l'app
 * (`border-collapse`, marges à zéro, `display` sur les tables…) réécrirait la
 * mise en page email, et l'aperçu ne montrerait plus ce qui part vraiment.
 *
 * Le shadow root isole dans les deux sens tout en laissant les événements
 * remonter normalement — le clic sur un bloc arrive donc à React.
 */
export function ShadowHtml({ html, className }: { html: string; className?: string }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<ShadowRoot | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!rootRef.current) {
      rootRef.current = host.attachShadow({ mode: "open" });
      // Un lien de l'aperçu ne navigue jamais (audit, constat S3) : le clic
      // sert à sélectionner le bloc, et un `href` saisi dans un bloc — même
      // refusé par le schéma à l'enregistrement — ne doit pas s'exécuter dans
      // la session de la personne qui relit. L'événement continue de remonter
      // vers React : la sélection du bloc fonctionne comme avant.
      rootRef.current.addEventListener("click", (event) => {
        const target = event.target as Element | null;
        if (target?.closest?.("a")) event.preventDefault();
      });
    }
    rootRef.current.innerHTML = html;
  }, [html]);

  // Le contenu est posé par l'effet ci-dessus, jamais par React : `hostRef`
  // ne doit donc rendre aucun enfant, sinon React et l'effet se disputeraient
  // le même nœud.
  return <div ref={hostRef} className={className} />;
}
