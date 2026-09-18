import Link from "next/link";
import { getDictionary, IS_MONOLINGUAL, LOCALES, LOCALE_LABEL, type Locale } from "@/lib/i18n";
import { navRoutes, path, ROUTES, type RouteKey } from "@/lib/routes";
import { BrandMark } from "./brand-mark";
import { Container } from "./layout-primitives";

const GROUPES: { cle: "metiers" | "produit"; routes: (locale: Locale) => RouteKey[] }[] = [
  { cle: "metiers", routes: () => navRoutes("metiers") },
  { cle: "produit", routes: () => navRoutes("produit") },
];

const LEGAL: RouteKey[] = ["mentionsLegales", "confidentialite"];

/**
 * Le pied de page. Comme l'en-tête, il ne liste que les pages construites.
 *
 * LE SÉLECTEUR DE LANGUE existe déjà, en entier — il est simplement masqué
 * tant qu'il n'y a qu'une langue (`IS_MONOLINGUAL`). Le jour où l'anglais
 * arrive, il apparaît sans qu'une ligne soit écrite ici.
 */
export function SiteFooter({ locale }: { locale: Locale }) {
  const { common } = getDictionary(locale);
  const groupes = GROUPES.map((g) => ({ cle: g.cle, entrees: g.routes(locale) })).filter(
    (g) => g.entrees.length > 0
  );
  const legal = LEGAL.filter((cle) => ROUTES[cle].built);

  return (
    <footer className="border-t border-border bg-muted/40">
      <Container className="py-12 sm:py-16">
        <div className="flex flex-col gap-10 lg:flex-row lg:justify-between">
          <div className="max-w-sm">
            <BrandMark href={path(locale, "accueil")} />
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{common.pied.presentation}</p>
          </div>

          {(groupes.length > 0 || legal.length > 0) && (
            <nav aria-label={common.coquille.navigationDuPied} className="grid grid-cols-2 gap-8 sm:grid-cols-3">
              {groupes.map((groupe) => (
                <div key={groupe.cle}>
                  <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {common.groupes[groupe.cle]}
                  </h2>
                  <ul className="mt-4 flex flex-col gap-1">
                    {groupe.entrees.map((cle) => (
                      <li key={cle}>
                        <Link
                          href={path(locale, cle)}
                          className="inline-flex min-h-9 items-center text-sm text-foreground hover:text-primary-ink"
                        >
                          {common.nav[cle]}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {legal.length > 0 && (
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {common.groupes.legal}
                  </h2>
                  <ul className="mt-4 flex flex-col gap-1">
                    {legal.map((cle) => (
                      <li key={cle}>
                        <Link
                          href={path(locale, cle)}
                          className="inline-flex min-h-9 items-center text-sm text-foreground hover:text-primary-ink"
                        >
                          {common.nav[cle]}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </nav>
          )}
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {common.pied.droits.replace("{annee}", String(new Date().getFullYear()))}
          </p>
          {!IS_MONOLINGUAL && (
            <nav aria-label={common.coquille.choisirLaLangue}>
              <ul className="flex items-center gap-3">
                {LOCALES.map((autre) => (
                  <li key={autre}>
                    <Link
                      href={path(autre, "accueil")}
                      hrefLang={autre}
                      aria-current={autre === locale ? "true" : undefined}
                      className="text-sm text-muted-foreground hover:text-foreground aria-[current]:text-foreground"
                    >
                      {LOCALE_LABEL[autre]}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      </Container>
    </footer>
  );
}
