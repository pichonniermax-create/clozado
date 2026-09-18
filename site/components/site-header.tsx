import Link from "next/link";
import { cn } from "@/lib/cn";
import { getDictionary, type Locale } from "@/lib/i18n";
import { navRoutes, path, type RouteKey } from "@/lib/routes";
import { SITE_CONFIG } from "@/lib/site-config";
import { ActionLink } from "./action-link";
import { BrandMark } from "./brand-mark";
import { Container } from "./layout-primitives";

/**
 * L'en-tête. Sa navigation est DÉDUITE des pages réellement construites
 * (`lib/routes.ts`) : le site n'a jamais de lien mort, et ouvrir une page
 * revient à basculer un booléen — l'en-tête, le pied et le sitemap suivent.
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
    <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-sm">
      <Container className="flex h-16 items-center justify-between gap-4">
        <BrandMark href={path(locale, "accueil")} />

        {entrees.length > 0 && (
          <nav aria-label={common.coquille.navigationPrincipale} className="hidden md:block">
            <ul className="flex items-center gap-1">
              {entrees.map((cle) => (
                <li key={cle}>
                  <Link
                    href={path(locale, cle)}
                    className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {common.nav[cle]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="flex items-center gap-2">
          {/* L'appel à l'action reste visible à TOUTES les largeurs, y
              compris 390 px : c'est la seule raison d'être de cet en-tête.
              Le repli de navigation, lui, n'apparaît que sous `md`. */}
          <ActionLink href={SITE_CONFIG.bookingUrl} externe mentionNouvelOnglet={common.actions.nouvelOnglet}>
            {common.actions.reserverUneDemo}
          </ActionLink>

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
