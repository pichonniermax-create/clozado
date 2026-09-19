"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { Titre } from "@/lib/markdown";

/**
 * LE SOMMAIRE D'UN ARTICLE — affiché au-delà de six titres, et il suit la
 * lecture.
 *
 * Sans JavaScript, c'est une liste d'ancres : elle fonctionne, elle ne
 * souligne simplement pas la section en cours. Avec, un écouteur de
 * défilement passif retient le dernier titre passé sous le quart supérieur
 * de la fenêtre — c'est la section qu'on lit, pas celle qui occupe le plus
 * de place.
 *
 * `prefers-reduced-motion` ne change rien ici : il n'y a aucune animation,
 * seulement une couleur et un filet qui se déplacent d'un cran.
 */
export function Sommaire({ titres, titre, aide }: { titres: readonly Titre[]; titre: string; aide: string }) {
  const [actif, setActif] = useState<string>(titres[0]?.id ?? "");

  useEffect(() => {
    const cibles = titres.map((t) => document.getElementById(t.id)).filter((e): e is HTMLElement => Boolean(e));
    if (cibles.length === 0) return;

    /*
     * UNE SEULE MESURE, et elle regarde le HAUT de la fenêtre : la section
     * en cours est le dernier titre passé sous le quart supérieur — pas
     * celle qui occupe le plus de place à l'écran.
     *
     * Il y avait ici DEUX mécanismes qui faisaient exactement ce calcul :
     * un `IntersectionObserver` dont le rappel relisait toutes les
     * positions, et cet écouteur de défilement. L'observateur n'apportait
     * rien qu'un `scroll` passif ne donne déjà, et il recalculait tout une
     * seconde fois à chaque croisement.
     */
    const mesurer = () => {
      const limite = window.innerHeight * 0.25;
      let courant = cibles[0];
      for (const cible of cibles) {
        if (cible.getBoundingClientRect().top <= limite) courant = cible;
      }
      setActif(courant.id);
    };

    mesurer();
    window.addEventListener("scroll", mesurer, { passive: true });
    window.addEventListener("resize", mesurer, { passive: true });
    return () => {
      window.removeEventListener("scroll", mesurer);
      window.removeEventListener("resize", mesurer);
    };
  }, [titres]);

  return (
    <nav aria-label={aide} className="lg:sticky lg:top-28">
      <p className="label">{titre}</p>
      <ul className="mt-6 flex flex-col gap-3 border-l border-border">
        {titres.map((t) => (
          <li key={t.id}>
            <a
              href={`#${t.id}`}
              aria-current={actif === t.id ? "true" : undefined}
              className={cn(
                "-ml-px flex min-h-6 items-center border-l pl-4 text-sm leading-snug transition-colors duration-200 ease-out",
                t.niveau === 3 && "pl-7",
                actif === t.id
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.texte}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
