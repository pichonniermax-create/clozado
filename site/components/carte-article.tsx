import { sansOrphelin } from "@/lib/titres";

/**
 * UNE ENTRÉE DE L'INDEX — la date, le temps de lecture, la catégorie, le
 * titre, le résumé. Rien de plus : une liste d'articles n'a pas besoin
 * d'images ni d'extraits tronqués à mi-phrase.
 */
export function CarteArticle({
  href,
  titre,
  resume,
  categorie,
  categorieHref,
  date,
  dateISO,
  minutes,
  lecture,
  demonstration,
  libelleDemonstration,
}: {
  href: string;
  titre: string;
  resume: string;
  categorie: string;
  categorieHref: string;
  date: string;
  dateISO: string;
  minutes: number;
  lecture: string;
  demonstration: boolean;
  libelleDemonstration: string;
}) {
  return (
    <article className="border-b border-border py-8 first:pt-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <a
          href={categorieHref}
          className="label inline-flex min-h-6 items-center transition-colors duration-200 ease-out hover:text-foreground focus-visible:text-foreground"
        >
          {categorie}
        </a>
        <p className="tabulaire text-detail text-muted-foreground">
          <time dateTime={dateISO}>{date}</time> · {minutes} {lecture}
        </p>
        {demonstration && (
          <p className="rounded-full border border-border px-3 py-0.5 text-detail font-medium text-primary-ink">
            {libelleDemonstration}
          </p>
        )}
      </div>
      <h2 className="mt-4 text-balance text-titre-3">
        <a
          href={href}
          className="text-foreground transition-colors duration-200 ease-out hover:text-primary-ink focus-visible:text-primary-ink"
        >
          {sansOrphelin(titre)}
        </a>
      </h2>
      <p className="mesure mt-4 text-pretty leading-relaxed text-muted-foreground">{resume}</p>
    </article>
  );
}
