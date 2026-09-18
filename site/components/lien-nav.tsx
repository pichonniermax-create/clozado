"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * UN LIEN DE LA BARRE, qui sait s'il désigne la page où l'on se trouve.
 *
 * La coquille est rendue sur le serveur et ne connaît pas l'adresse
 * courante ; c'était donc le module de mouvement qui posait `aria-current`
 * au chargement. Deux défauts, mesurés : il ne le RETIRAIT jamais, si bien
 * qu'après deux navigations côté client deux entrées se disaient « page
 * courante » ; et les pages qui ne chargent pas le module — les pages
 * légales, la démonstration — n'en avaient aucune.
 *
 * Ici, c'est le chemin qui décide, à chaque rendu : une entrée et une seule
 * porte `aria-current`.
 *
 * ET L'ÉTAT COURANT N'EST PLUS UN SOULIGNÉ : le souligné bordeaux est
 * réservé au SURVOL et au FOCUS CLAVIER, c'est-à-dire à ce qui est
 * transitoire. La page où l'on se trouve se dit autrement — son libellé
 * passe en encre pleine. Sans cela, un clic à la souris laissait derrière
 * lui un souligné qu'on prenait pour un focus resté allumé.
 */
export function LienNav({
  href,
  libelle,
  className,
  classeCourante,
}: {
  href: string;
  libelle: string;
  className: string;
  classeCourante: string;
}) {
  const chemin = usePathname();
  const courante = chemin === href || chemin === `${href}/`;
  return (
    <Link href={href} aria-current={courante ? "page" : undefined} className={courante ? classeCourante : className}>
      {libelle}
    </Link>
  );
}
