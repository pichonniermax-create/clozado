import { cn } from "@/lib/cn";
import type { Titre } from "@/lib/markdown";

/**
 * LE SOMMAIRE D'UN ARTICLE — affiché au-delà de six titres, et il suit la
 * lecture.
 *
 * Sans JavaScript, c'est une liste d'ancres : elle fonctionne, elle ne
 * souligne simplement pas la section en cours. Avec, un écouteur de
 * défilement passif (`public/comportements.js`) retient le dernier titre
 * passé sous le quart supérieur de la fenêtre — c'est la section qu'on lit,
 * pas celle qui occupe le plus de place.
 *
 * LE SCRIPT NE POSE QU'UN ATTRIBUT, `aria-current` ; l'apparence de l'entrée
 * courante est écrite en CSS (`.lien-sommaire`, dans `app/globals.css`).
 * Un script qui échangerait des classes utilitaires les emporterait hors des
 * fichiers où elles se lisent.
 *
 * `prefers-reduced-motion` ne change rien ici : il n'y a aucune animation,
 * seulement une couleur et un filet qui se déplacent d'un cran.
 */
export function Sommaire({ titres, titre, aide }: { titres: readonly Titre[]; titre: string; aide: string }) {
  return (
    <nav aria-label={aide} data-sommaire className="lg:sticky lg:top-28">
      <p className="label">{titre}</p>
      <ul className="mt-6 flex flex-col gap-3 border-l border-border">
        {titres.map((t, rang) => (
          <li key={t.id}>
            <a
              href={`#${t.id}`}
              aria-current={rang === 0 ? "true" : undefined}
              className={cn("lien-sommaire", t.niveau === 3 && "pl-6")}
            >
              {t.texte}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
