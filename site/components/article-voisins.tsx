import { sansOrphelin } from "@/lib/titres";

/**
 * L'ARTICLE PRÉCÉDENT ET LE SUIVANT — dans l'ordre de publication, le
 * « suivant » étant le plus récent.
 *
 * S'il n'y en a qu'un des deux, il occupe toute la largeur : la règle des
 * grilles vaut ici aussi, une carte seule ne laisse pas de vide à côté.
 */
export function ArticleVoisins({
  precedent,
  suivant,
  libelles,
}: {
  precedent?: { readonly titre: string; readonly href: string };
  suivant?: { readonly titre: string; readonly href: string };
  libelles: { readonly precedent: string; readonly suivant: string; readonly aide: string };
}) {
  const voisins = [
    precedent ? { ...precedent, sens: libelles.precedent } : null,
    suivant ? { ...suivant, sens: libelles.suivant } : null,
  ].filter(Boolean) as { titre: string; href: string; sens: string }[];

  if (voisins.length === 0) return null;

  return (
    <nav aria-label={libelles.aide} className="grille-cartes" data-colonnes="2">
      {voisins.map((voisin) => (
        <a
          key={voisin.href}
          href={voisin.href}
          className="block rounded-xl border border-border bg-card p-6 transition-colors duration-200 ease-out hover:border-primary"
        >
          <p className="label">{voisin.sens}</p>
          <p className="mt-4 text-balance text-xl font-bold tracking-tight text-foreground">
            {sansOrphelin(voisin.titre)}
          </p>
        </a>
      ))}
    </nav>
  );
}
