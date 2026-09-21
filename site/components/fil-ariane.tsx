
/**
 * LE FIL D'ARIANE — il dit où l'on est, et il est aussi le balisage
 * `BreadcrumbList` que la page émet à côté : les deux viennent de la même
 * liste, donc ils ne peuvent pas diverger.
 *
 * Le dernier maillon n'est pas un lien — c'est la page courante — et il
 * porte `aria-current="page"`.
 */
export type Maillon = { readonly libelle: string; readonly href?: string };

export function FilAriane({ maillons, aide }: { maillons: readonly Maillon[]; aide: string }) {
  return (
    <nav aria-label={aide}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        {maillons.map((maillon, rang) => (
          <li key={maillon.libelle} className="flex items-center gap-2">
            {rang > 0 && <span aria-hidden>·</span>}
            {maillon.href ? (
              <a
                href={maillon.href}
                className="inline-flex min-h-6 items-center transition-colors duration-200 ease-out hover:text-foreground focus-visible:text-foreground"
              >
                {maillon.libelle}
              </a>
            ) : (
              <span aria-current="page" className="inline-flex min-h-6 items-center text-foreground">
                {maillon.libelle}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
