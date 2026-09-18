import Link from "next/link";
import { cn } from "@/lib/cn";
import { getDictionary, type Locale } from "@/lib/i18n";
import { navRoutes, path, type RouteKey } from "@/lib/routes";
import { LOGIN_URL, SITE_CONFIG } from "@/lib/site-config";
import { ActionLink } from "./action-link";
import { BrandMark } from "./brand-mark";
import { Container } from "./layout-primitives";

/**
 * L'en-tête. Sa navigation est DÉDUITE des pages réellement construites
 * (`lib/routes.ts`) : le site n'a jamais de lien mort, et ouvrir une page
 * revient à basculer un booléen — l'en-tête, le pied et le sitemap suivent.
 *
 * Sa hauteur se resserre et son filet apparaît au-delà de 80 px de
 * défilement — c'est du CSS, piloté par `[data-defile]` sur `<html>`. Le
 * souligné bordeaux d'un lien pousse depuis la gauche au survol et au
 * focus, et reste posé sur la page où l'on se trouve (`aria-current`, posé
 * par le script de mouvement, donc sur les pages qui le chargent).
 *
 * Le repli mobile est un `<details>` natif : il fonctionne sans
 * JavaScript, il est accessible au clavier d'origine, et il ne coûte pas
 * un octet de script. Ses liens sont des `<a>` et non des `<Link>` : une
 * navigation client laisserait le repli OUVERT derrière elle, et le
 * refermer demanderait du JavaScript. Un chargement de page le referme
 * tout seul. La navigation de bureau, elle, reste en `<Link>`.
 */
export function SiteHeader({ locale }: { locale: Locale }) {
  const { common } = getDictionary(locale);
  const entrees: RouteKey[] = [...navRoutes("metiers"), ...navRoutes("produit")];

  return (
    <header className="entete sticky top-0 z-20 border-b bg-background/90 backdrop-blur-sm">
      <Container className="entete-rangee flex items-center justify-between gap-4">
        <BrandMark href={path(locale, "accueil")} />

        {entrees.length > 0 && (
          <nav aria-label={common.coquille.navigationPrincipale} className="hidden md:block">
            <ul className="flex items-center gap-1">
              {entrees.map((cle) => (
                <li key={cle}>
                  <Link
                    href={path(locale, cle)}
                    className="lien-nav inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-muted-foreground transition-colors duration-200 ease-out hover:text-foreground"
                  >
                    {common.nav[cle]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="flex items-center gap-2">
          {/* La connexion est un LIEN TEXTE, jamais un second bouton plein :
              deux boutons pleins côte à côte ne disent plus lequel compte. */}
          <a
            href={LOGIN_URL}
            className="hidden min-h-11 items-center rounded-lg px-3 text-sm font-medium text-foreground transition-colors duration-200 ease-out hover:text-primary-ink sm:inline-flex"
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
            <ActionLink href={SITE_CONFIG.bookingUrl} externe mentionNouvelOnglet={common.actions.nouvelOnglet}>
              {common.actions.reserverUneDemo}
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
                        className="flex min-h-11 items-center rounded-lg px-3 text-sm text-foreground hover:bg-muted"
                      >
                        {common.nav[cle]}
                      </a>
                    </li>
                  ))}
                  <li className="mt-1 border-t border-border pt-2">
                    <a href={LOGIN_URL} className="flex min-h-11 items-center rounded-lg px-3 text-sm text-foreground hover:bg-muted">
                      {common.actions.seConnecter}
                    </a>
                  </li>
                  <li>
                    <a
                      href={SITE_CONFIG.bookingUrl}
                      target="_blank"
                      rel="noopener"
                      className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-primary-ink hover:bg-muted"
                    >
                      {common.actions.reserverUneDemo}
                      <span className="sr-only">{common.actions.nouvelOnglet}</span>
                    </a>
                  </li>
                </ul>
              </nav>
            </details>
          )}
        </div>
      </Container>
    </header>
  );
}

/** Le premier élément focalisable de la page : un saut vers le contenu, visible seulement au clavier. */
export function SkipLink({ label }: { label: string }) {
  return (
    <a
      href="#contenu"
      className={cn(
        "sr-only rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground",
        "focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      )}
    >
      {label}
    </a>
  );
}
