/**
 * L'ENTRÉE DE BARRE QUI PORTE UN DÉROULANT.
 *
 * Elle n'a plus de composant client : le balisage est rendu au build, fermé,
 * et `public/comportements.js` lui donne ses six fermetures (clic ailleurs,
 * Échap, défilement, sortie du curseur, second appui tactile, navigation).
 * Le composant React coûtait 207 lignes et un morceau du socle ; il ne
 * restait de lui, à l'écran, qu'un attribut qui bascule.
 *
 * SANS JAVASCRIPT, le panneau reste atteignable : le CSS de repli (survol et
 * `:focus-within`) s'applique tant que le script n'a pas posé `data-js` sur
 * le groupe. Le menu n'est donc jamais mort, il est seulement moins bien.
 *
 * L'IDENTIFIANT DU PANNEAU vient de la clé de la page parente, pas d'un
 * `useId()` : une page construite deux fois doit donner deux fois le même
 * HTML, sinon le dépouillement ne serait plus vérifiable.
 */
export function NavDeroulant({
  cle,
  href,
  libelle,
  intitule,
  entrees,
  classeLien,
}: {
  /** La clé de la page parente — elle nomme le panneau. */
  cle: string;
  href: string;
  libelle: string;
  /** Le titre du panneau, en petites capitales. */
  intitule: string;
  entrees: readonly { href: string; libelle: string }[];
  classeLien: string;
}) {
  const panneau = `panneau-${cle}`;
  return (
    <li className="groupe-nav relative" data-deroulant data-ouvert="non">
      <a
        href={href}
        data-nav
        data-deroulant-lien
        aria-expanded="false"
        aria-controls={panneau}
        className={classeLien}
      >
        {libelle}
      </a>

      <div className="deroulant absolute left-0 top-full pt-2">
        <ul id={panneau} data-deroulant-panneau className="w-72 rounded-xl border border-border bg-card p-2">
          <li className="label px-3 py-2">{intitule}</li>
          {entrees.map((entree) => (
            <li key={entree.href}>
              <a
                href={entree.href}
                data-nav
                className="flex min-h-11 items-center rounded-lg px-3 text-sm text-foreground transition-colors duration-200 ease-out hover:bg-muted"
              >
                {entree.libelle}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}
