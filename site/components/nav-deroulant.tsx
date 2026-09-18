"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

/**
 * L'ENTRÉE DE BARRE QUI PORTE UN DÉROULANT.
 *
 * La version précédente était en CSS pur : elle s'ouvrait au survol et au
 * focus, et ne se fermait JAMAIS autrement qu'en retirant le curseur. Ni
 * Échap, ni clic ailleurs, ni défilement, ni toucher. C'était un défaut
 * d'usage, pas une élégance.
 *
 * ELLE SE FERME MAINTENANT de cinq façons : clic ailleurs, touche Échap
 * (qui rend le focus au lien parent), défilement, sortie du curseur après
 * un délai, et navigation.
 *
 * LES DEUX DÉLAIS NE SONT PAS SYMÉTRIQUES : 120 ms pour ouvrir — assez pour
 * qu'un curseur qui traverse la barre n'ouvre pas tout sur son passage —,
 * 280 ms pour fermer, parce qu'il y a un vide de 8 px entre le lien et le
 * panneau et qu'un menu qui se referme pendant qu'on le traverse est un
 * menu qu'on n'atteint pas.
 *
 * AU TOUCHER, il n'y a pas de survol : le premier appui ouvre le panneau au
 * lieu de naviguer, le second suit le lien. C'est le comportement attendu
 * d'une entrée qui est à la fois une page et un sommaire.
 *
 * SANS JAVASCRIPT, rien de tout cela n'existe — et le panneau reste
 * atteignable : le CSS de repli (survol et `:focus-within`) s'applique tant
 * que ce composant n'a pas posé `data-js` sur son groupe. Le menu n'est
 * donc jamais mort, il est seulement moins bien.
 */

const DELAI_ENTREE = 120;
const DELAI_SORTIE = 280;

export function NavDeroulant({
  href,
  libelle,
  intitule,
  entrees,
  classeLien,
}: {
  href: string;
  libelle: string;
  /** Le titre du panneau, en petites capitales. */
  intitule: string;
  entrees: readonly { href: string; libelle: string }[];
  classeLien: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const groupe = useRef<HTMLLIElement>(null);
  const lien = useRef<HTMLAnchorElement>(null);
  const panneau = useRef<HTMLUListElement>(null);
  const minuteur = useRef(0);
  const identifiant = useId();
  const chemin = usePathname();

  /** Le composant a pris la main : le CSS de repli se retire de lui-même. */
  useEffect(() => {
    groupe.current?.setAttribute("data-js", "1");
  }, []);

  const fermer = useCallback(() => {
    window.clearTimeout(minuteur.current);
    setOuvert(false);
  }, []);

  const planifier = (valeur: boolean, delai: number) => {
    window.clearTimeout(minuteur.current);
    minuteur.current = window.setTimeout(() => setOuvert(valeur), delai);
  };

  /** La navigation ferme : l'en-tête, lui, ne se démonte pas d'une page à l'autre. */
  useEffect(() => {
    fermer();
  }, [chemin, fermer]);

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (evenement: PointerEvent) => {
      if (!groupe.current?.contains(evenement.target as Node)) fermer();
    };
    const auDefilement = () => fermer();
    const auClavier = (evenement: KeyboardEvent) => {
      if (evenement.key !== "Escape") return;
      fermer();
      lien.current?.focus();
    };
    document.addEventListener("pointerdown", dehors);
    document.addEventListener("keydown", auClavier);
    window.addEventListener("scroll", auDefilement, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", dehors);
      document.removeEventListener("keydown", auClavier);
      window.removeEventListener("scroll", auDefilement);
    };
  }, [ouvert, fermer]);

  useEffect(() => () => window.clearTimeout(minuteur.current), []);

  const liens = () => Array.from(panneau.current?.querySelectorAll("a") ?? []);

  /** Les flèches parcourent le panneau ; Échap en sort par le lien parent. */
  const auClavier = (evenement: React.KeyboardEvent) => {
    const touche = evenement.key;
    if (touche !== "ArrowDown" && touche !== "ArrowUp" && touche !== "Home" && touche !== "End") return;
    evenement.preventDefault();
    window.clearTimeout(minuteur.current);
    setOuvert(true);
    // Le panneau vient peut-être d'apparaître : on attend la peinture.
    requestAnimationFrame(() => {
      const items = liens();
      if (items.length === 0) return;
      const actuel = items.indexOf(document.activeElement as HTMLAnchorElement);
      const cible =
        touche === "Home"
          ? 0
          : touche === "End"
            ? items.length - 1
            : touche === "ArrowDown"
              ? actuel < 0
                ? 0
                : Math.min(actuel + 1, items.length - 1)
              : actuel <= 0
                ? -1
                : actuel - 1;
      if (cible < 0) lien.current?.focus();
      else items[cible]?.focus();
    });
  };

  /** Au toucher, le premier appui ouvre ; le second suit le lien. */
  const auClic = (evenement: React.MouseEvent<HTMLAnchorElement>) => {
    if (!window.matchMedia("(hover: none)").matches) return;
    if (ouvert) return;
    evenement.preventDefault();
    window.clearTimeout(minuteur.current);
    setOuvert(true);
  };

  return (
    <li
      ref={groupe}
      className="groupe-nav relative"
      data-ouvert={ouvert ? "oui" : "non"}
      onPointerEnter={(evenement) => {
        if (evenement.pointerType !== "mouse") return;
        planifier(true, DELAI_ENTREE);
      }}
      onPointerLeave={(evenement) => {
        if (evenement.pointerType !== "mouse") return;
        planifier(false, DELAI_SORTIE);
      }}
      onKeyDown={auClavier}
    >
      <Link
        ref={lien}
        href={href}
        aria-expanded={ouvert}
        aria-controls={`${identifiant}-panneau`}
        onClick={auClic}
        className={classeLien}
      >
        {libelle}
      </Link>

      <div className="deroulant absolute left-0 top-full pt-2">
        <ul ref={panneau} id={`${identifiant}-panneau`} className="w-72 rounded-xl border border-border bg-card p-2">
          <li className="label px-3 py-2">{intitule}</li>
          {entrees.map((entree) => (
            <li key={entree.href}>
              <Link
                href={entree.href}
                onClick={fermer}
                className="flex min-h-11 items-center rounded-lg px-3 text-sm text-foreground transition-colors duration-200 ease-out hover:bg-muted"
              >
                {entree.libelle}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}
