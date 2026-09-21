import { getDictionary, type Locale } from "@/lib/i18n";
import { builtRoutes, path } from "@/lib/routes";
import { Container } from "./layout-primitives";
import { sansOrphelin } from "@/lib/titres";

/**
 * LE CORPS DE LA PAGE 404 — un seul écrit, servi aussi bien par la page
 * introuvable d'une langue que par la page introuvable globale (une
 * adresse qui ne correspond à aucune langue).
 *
 * Elle n'est pas une impasse : elle dit ce qui s'est passé, et elle liste
 * les pages qui existent. Le `noindex` est posé par Next sur toute réponse
 * 404 ; rien à écrire ici.
 */
export function NotFoundContent({ locale }: { locale: Locale }) {
  const { common } = getDictionary(locale);
  const pages = builtRoutes();

  return (
    <Container className="flex flex-1 flex-col justify-center py-24 sm:py-24">
      <div className="colonne-lecture-centree">
        <p className="font-mono text-sm tabular-nums text-muted-foreground">{common.introuvable.code}</p>
        <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{sansOrphelin(common.introuvable.titre)}</h1>
        <p className="mt-4 text-pretty leading-relaxed text-foreground">{common.introuvable.texte}</p>

        <nav aria-label={common.coquille.navigationPrincipale} className="mt-6">
          <ul className="flex flex-col gap-1">
            {pages.map((cle) => (
              <li key={cle}>
                <a
                  href={path(locale, cle)}
                  className="inline-flex min-h-11 items-center text-base font-medium text-primary-ink hover:underline"
                >
                  {common.nav[cle]}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </Container>
  );
}
