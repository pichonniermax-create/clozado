import { MiseEnMouvement } from "./mise-en-mouvement";

/**
 * LE MOUVEMENT D'UNE PAGE, en un seul élément à poser en tête.
 *
 * Le drapeau est écrit par un script SYNCHRONE : il doit être posé avant
 * que le corps ne soit peint, sinon les blocs apparaîtraient une fraction
 * de seconde avant d'être masqués. C'est aussi lui qui rend l'ensemble sûr —
 * sans JavaScript, l'attribut n'existe pas, donc le CSS qui masque ne
 * s'applique pas et la page reste entière.
 *
 * LE FILET : le drapeau se RETIRE de lui-même au bout de 2,5 s si le module
 * de mouvement n'a pas répondu (`data-anime`). Sans lui, une hydratation en
 * échec laisserait une page aux trois quarts masquée — le seul vrai danger
 * de ce dispositif, puisque c'est le CSS qui cache et le script qui montre.
 */
export function Mouvement() {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          // eslint-disable-next-line local/no-visible-text -- du JavaScript, pas un texte : ce script pose data-mouvement avant le premier rendu
          __html: 'var d=document.documentElement.dataset;d.mouvement="1";setTimeout(function(){if(!d.anime)delete d.mouvement},2500)',
        }}
      />
      <MiseEnMouvement />
    </>
  );
}
