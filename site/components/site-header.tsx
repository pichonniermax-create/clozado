import { cn } from "@/lib/cn";
import { getDictionary, type Locale } from "@/lib/i18n";
import { menuPrincipal, path, sousEntrees, type RouteKey } from "@/lib/routes";
import { DEMO_URL, LOGIN_URL, RESERVATION_EN_LIGNE, RESERVATION_URL } from "@/lib/site-config";
import { ActionLink } from "./action-link";
import { BrandMark } from "./brand-mark";
import { NavDeroulant } from "./nav-deroulant";
import { Container } from "./layout-primitives";

/**
 * L'en-tête. Sa navigation est DÉDUITE des pages réellement construites
 * (`lib/routes.ts`) : le site n'a jamais de lien mort, et ouvrir une page
 * revient à basculer un booléen — l'en-tête, le pied et le sitemap suivent.
 *
 * Sa hauteur se resserre et son filet apparaît au-delà de 80 px de
 * défilement — c'est du CSS, piloté par `[data-defile]` sur `<html>`.
 *
 * LE SOULIGNÉ BORDEAUX est réservé à ce qui est TRANSITOIRE : le survol et
 * le focus CLAVIER (`:focus-visible`, jamais `:focus` — sinon un clic à la
 * souris le laissait allumé derrière lui). La page où l'on se trouve se dit
 * autrement : son libellé passe en encre pleine, posée par l'attribut
 * `aria-current` et le CSS qui le lit.
 *
 * Le repli mobile est un `<details>` natif : il fonctionne sans
 * JavaScript, il est accessible au clavier d'origine, et il ne coûte pas
 * un octet de script. Un chargement de page le referme tout seul — ce qui
 * est devenu vrai de toute la barre depuis que le site ne fait plus de
 * navigation client : tous ses liens sont des `<a>`.
 */
export function SiteHeader({ locale }: { locale: Locale }) {
  const { common } = getDictionary(locale);
  const entrees: RouteKey[] = menuPrincipal();

  return (
    <header className="entete sticky top-0 z-20 border-b bg-background/90 backdrop-blur-sm">
      <Container className="entete-rangee flex items-center justify-between gap-4">
        <BrandMark href={path(locale, "accueil")} />

        {entrees.length > 0 && (
          <nav aria-label={common.coquille.navigationPrincipale} className="hidden md:block">
            <ul className="flex items-center gap-1">
              {entrees.map((cle) => {
                const filles = sousEntrees(cle);
                const classeLien =
                  "lien-nav inline-flex min-h-11 items-center whitespace-nowrap rounded-lg px-3 text-sm text-muted-foreground transition-colors duration-200 ease-out hover:text-foreground";
                if (filles.length === 0) {
                  return (
                    <li key={cle}>
                      <a href={path(locale, cle)} data-nav className={classeLien}>
                        {common.nav[cle]}
                      </a>
                    </li>
                  );
                }
                return (
                  <NavDeroulant
                    key={cle}
                    cle={cle}
                    href={path(locale, cle)}
                    libelle={common.nav[cle]}
                    intitule={common.actions.voirLesMetiers}
                    classeLien={classeLien}
                    entrees={filles.map((fille) => ({ href: path(locale, fille), libelle: common.nav[fille] }))}
                  />
                );
              })}
            </ul>
          </nav>
        )}

        <div className="flex items-center gap-2">
          {/* La connexion est un LIEN TEXTE, jamais un second bouton plein :
              deux boutons pleins côte à côte ne disent plus lequel compte. */}
          <a
            href={LOGIN_URL}
            className="hidden min-h-11 items-center whitespace-nowrap rounded-lg px-3 text-sm font-medium text-foreground transition-colors duration-200 ease-out hover:text-primary-ink sm:inline-flex"
          >
            {common.actions.seConnecter}
          </a>

          {/* Sous 640 px, l'appel à l'action sort de la barre : à 360 px,
              marque + bouton + repli ne tiennent pas et le libellé passait
              sur deux lignes (constaté à la capture). Il reste atteignable
              en un geste — il est la dernière entrée du repli — et l'appel
              du hero est immédiatement sous la barre.
              Le repli responsive est porté par une ENVELOPPE, jamais par
              une classe passée à `ActionLink` : `hidden` et `inline-flex`
              sont deux utilitaires `display` de même spécificité, et c'est
              l'ordre de la feuille de style qui tranche, pas celui des
              classes. */}
          <div className="hidden sm:flex">
            <ActionLink href={DEMO_URL} externe mentionNouvelOnglet={common.actions.nouvelOnglet}>
              {common.actions.voirLaDemo}
            </ActionLink>
          </div>

          {entrees.length > 0 && (
            <details className="group relative md:hidden">
              <summary className="inline-flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-lg border border-border px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                {common.coquille.ouvrirLeMenu}
              </summary>
              <nav
                aria-label={common.coquille.navigationPrincipale}
                className="absolute right-0 top-[calc(100%+0.5rem)] w-64 rounded-xl border border-border bg-card p-2 shadow-lg"
              >
                <ul className="flex flex-col">
                  {entrees.map((cle) => (
                    <li key={cle}>
                      <a
                        href={path(locale, cle)}
                        data-nav
                        className="flex min-h-11 items-center rounded-lg px-3 text-sm text-foreground hover:bg-muted"
                      >
                        {common.nav[cle]}
                      </a>
                      {sousEntrees(cle).length > 0 && (
                        <ul className="mb-1 ml-3 flex flex-col border-l border-border pl-2">
                          {sousEntrees(cle).map((fille) => (
                            <li key={fille}>
                              <a
                                href={path(locale, fille)}
                                data-nav
                                className="flex min-h-11 items-center rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted"
                              >
                                {common.nav[fille]}
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                  <li className="mt-1 border-t border-border pt-2">
                    <a href={LOGIN_URL} className="flex min-h-11 items-center rounded-lg px-3 text-sm text-foreground hover:bg-muted">
                      {common.actions.seConnecter}
                    </a>
                  </li>
                  <li>
                    <a
                      href={DEMO_URL}
                      target="_blank"
                      rel="noopener"
                      className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-primary-ink hover:bg-muted"
                    >
                      {common.actions.ouvrirLaDemo}
                      <span className="sr-only">{common.actions.nouvelOnglet}</span>
                    </a>
                  </li>
                  {/* La réservation descend d'un rang quand elle existe : le
                      bouton de la barre n'a pas la place de porter les deux.
                      Tant qu'elle n'est pas en ligne, l'entrée n'existe pas. */}
                  {RESERVATION_EN_LIGNE && (
                    <li>
                      <a
                        href={RESERVATION_URL}
                        target="_blank"
                        rel="noopener"
                        className="flex min-h-11 items-center rounded-lg px-3 text-sm text-foreground hover:bg-muted"
                      >
                        {common.actions.reserverUneDemo}
                        <span className="sr-only">{common.actions.nouvelOnglet}</span>
                      </a>
                    </li>
                  )}
                </ul>
              </nav>
            </details>
          )}
        </div>
      </Container>

      {/* LA PAGE OÙ L'ON SE TROUVE, marquée AVANT LA PREMIÈRE PEINTURE.
          La coquille est rendue au build et ne connaît pas l'adresse
          courante. Ce script tient en une ligne, il est écrit ici même —
          donc exécuté dès que la barre est analysée, avant que quoi que ce
          soit ne soit peint : aucun battement, aucune entrée qui s'allume
          après coup. Il pose un ATTRIBUT et rien d'autre ; c'est le CSS qui
          en tire l'encre pleine (`app/globals.css`).
          Les deux défauts de la version précédente tombent d'eux-mêmes :
          il n'y a plus de navigation client qui laisserait deux entrées
          « courantes », et ce script est dans l'en-tête, donc sur TOUTES
          les pages — y compris les pages légales. */}
      <script dangerouslySetInnerHTML={{ __html: MARQUEUR_PAGE_COURANTE }} />
    </header>
  );
}

/**
 * Voir le commentaire ci-dessus. AUCUNE EXPRESSION RÉGULIÈRE ici : écrite
 * dans une chaîne, `/\/+$/` perdrait sa barre oblique d'échappement en
 * arrivant dans la page et deviendrait `//+$/` — un script cassé, et
 * cassé SILENCIEUSEMENT. Deux comparaisons de fin de chaîne font le même
 * travail et ne se trompent pas de couche.
 */
// eslint-disable-next-line local/no-visible-text -- du JavaScript, pas un texte lu dans une page
const MARQUEUR_PAGE_COURANTE = 'function n(v){return v.length>1&&v.slice(-1)==="/"?v.slice(0,-1):v}var c=n(location.pathname);document.querySelectorAll("a[data-nav]").forEach(function(a){if(n(a.getAttribute("href"))===c)a.setAttribute("aria-current","page")})';

/** Le premier élément focalisable de la page : un saut vers le contenu, visible seulement au clavier. */
export function SkipLink({ label }: { label: string }) {
  return (
    <a
      href="#contenu"
      className={cn(
        "sr-only rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground",
        "focus-visible:not-sr-only focus-visible:absolute focus-visible:left-4 focus-visible:top-4 focus-visible:z-50"
      )}
    >
      {label}
    </a>
  );
}
