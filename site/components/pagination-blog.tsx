import { cn } from "@/lib/cn";

/**
 * LA PAGINATION DE L'INDEX — des LIENS, jamais des boutons : ils naviguent.
 * Une page inexistante n'a pas de lien mort, elle n'a pas de lien du tout.
 */
export function PaginationBlog({
  page,
  pages,
  lien,
  libelles,
}: {
  page: number;
  pages: number;
  lien: (numero: number) => string;
  libelles: { readonly aide: string; readonly precedente: string; readonly suivante: string; readonly page: string; readonly sur: string };
}) {
  if (pages <= 1) return null;
  const classe =
    "inline-flex min-h-12 items-center rounded-full border border-border bg-card px-6 text-sm font-medium transition-colors duration-200 ease-out hover:bg-muted";
  return (
    <nav aria-label={libelles.aide} className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
      {page > 1 ? (
        <a href={lien(page - 1)} className={classe}>
          {libelles.precedente}
        </a>
      ) : (
        <span className={cn(classe, "invisible")} aria-hidden />
      )}
      <p className="tabulaire text-sm text-muted-foreground">
        {libelles.page} {page} {libelles.sur} {pages}
      </p>
      {page < pages ? (
        <a href={lien(page + 1)} className={classe}>
          {libelles.suivante}
        </a>
      ) : (
        <span className={cn(classe, "invisible")} aria-hidden />
      )}
    </nav>
  );
}
