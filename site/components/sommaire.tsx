"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import type { Titre } from "@/lib/markdown";

/**
 * LE SOMMAIRE D'UN ARTICLE — affiché au-delà de six titres, et il suit la
 * lecture.
 *
 * Sans JavaScript, c'est une liste d'ancres : elle fonctionne, elle ne
 * souligne simplement pas la section en cours. Avec, un
 * `IntersectionObserver` regarde le HAUT de la fenêtre (une bande de 20 %
 * sous l'en-tête) et retient le dernier titre passé dessous — c'est la
 * section qu'on lit, pas celle qui occupe le plus de place.
 *
 * `prefers-reduced-motion` ne change rien ici : il n'y a aucune animation,
 * seulement une couleur et un filet qui se déplacent d'un cran.
 */
export function Sommaire({ titres, titre, aide }: { titres: readonly Titre[]; titre: string; aide: string }) {
  const [actif, setActif] = useState<string>(titres[0]?.id ?? "");

  useEffect(() => {
    const cibles = titres.map((t) => document.getElementById(t.id)).filter((e): e is HTMLElement => Boolean(e));
    if (cibles.length === 0) return;

    const observateur = new IntersectionObserver(
      () => {
        // On ne se fie pas à l'ordre des entrées : on relit les positions.
        const limite = window.innerHeight * 0.25;
        let courant = cibles[0];
        for (const cible of cibles) {
          if (cible.getBoundingClientRect().top <= limite) courant = cible;
        }
        setActif(courant.id);
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: [0, 1] }
    );
    cibles.forEach((cible) => observateur.observe(cible));

    // Le premier calcul, sans attendre un croisement.
    const auDefilement = () => {
      const limite = window.innerHeight * 0.25;
      let courant = cibles[0];
      for (const cible of cibles) {
        if (cible.getBoundingClientRect().top <= limite) courant = cible;
      }
      setActif(courant.id);
    };
    auDefilement();
    window.addEventListener("scroll", auDefilement, { passive: true });
    return () => {
      observateur.disconnect();
      window.removeEventListener("scroll", auDefilement);
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
                "-ml-px block border-l pl-4 text-sm leading-snug transition-colors duration-200 ease-out",
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
