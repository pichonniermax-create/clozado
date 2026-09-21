import type { Bloc, Segment } from "@/lib/markdown";
import { Puce } from "./layout-primitives";

/**
 * LE CORPS D'UN ARTICLE — un composant par type de bloc, et rien d'autre.
 *
 * Le Markdown est analysé au build en blocs typés (`lib/markdown.ts`) ; ici
 * chaque bloc tombe sur une classe du SYSTÈME EXISTANT : un rayon (16 px),
 * un filet (1 px), un corps (17 px), les tailles de l'échelle. Aucune valeur
 * n'est inventée pour le blog.
 *
 * Rien n'est injecté en HTML : pas de `dangerouslySetInnerHTML`, donc rien à
 * assainir et aucune balise qui échappe au système.
 */

function Marques({ segments }: { segments: readonly Segment[] }) {
  return (
    <>
      {segments.map((segment, rang) => {
        switch (segment.type) {
          case "gras":
            return (
              <strong key={rang} className="font-semibold text-foreground">
                {segment.valeur}
              </strong>
            );
          case "italique":
            return (
              <em key={rang} className="italic">
                {segment.valeur}
              </em>
            );
          case "code":
            return (
              <code key={rang} className="rounded-md bg-muted px-2 py-1 font-mono text-sm text-foreground">
                {segment.valeur}
              </code>
            );
          case "lien":
            return (
              <a
                key={rang}
                href={segment.href}
                className="text-primary-ink underline underline-offset-4 transition-colors duration-200 ease-out hover:text-primary-hover"
              >
                {segment.valeur}
              </a>
            );
          default:
            return <span key={rang}>{segment.valeur}</span>;
        }
      })}
    </>
  );
}

export function ArticleCorps({ blocs }: { blocs: readonly Bloc[] }) {
  return (
    <div className="flex flex-col gap-6">
      {blocs.map((bloc, rang) => {
        switch (bloc.type) {
          case "titre":
            return bloc.niveau === 2 ? (
              <h2
                key={rang}
                id={bloc.id}
                className="mt-6 scroll-mt-28 text-balance text-titre-3 text-foreground first:mt-0"
              >
                {bloc.texte}
              </h2>
            ) : (
              <h3 key={rang} id={bloc.id} className="mt-2 scroll-mt-28 text-xl font-bold tracking-tight text-foreground">
                {bloc.texte}
              </h3>
            );

          case "paragraphe":
            return (
              <p key={rang} className="mesure text-pretty leading-relaxed text-muted-foreground">
                <Marques segments={bloc.segments} />
              </p>
            );

          case "liste":
            return bloc.ordonnee ? (
              <ol key={rang} className="flex flex-col gap-4">
                {bloc.elements.map((element, i) => (
                  <li key={i} className="flex gap-4 leading-relaxed">
                    <span className="tabulaire shrink-0 text-sm text-muted-foreground">{i + 1}</span>
                    <span className="mesure text-muted-foreground">
                      <Marques segments={element} />
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <ul key={rang} className="flex flex-col gap-4">
                {bloc.elements.map((element, i) => (
                  <li key={i} className="flex gap-4 leading-relaxed">
                    <Puce />
                    <span className="mesure text-muted-foreground">
                      <Marques segments={element} />
                    </span>
                  </li>
                ))}
              </ul>
            );

          case "citation":
            return (
              <figure key={rang} className="border-l border-border pl-6">
                <blockquote className="mesure text-pretty text-chapo leading-relaxed text-foreground">
                  <Marques segments={bloc.segments} />
                </blockquote>
                {bloc.source && <figcaption className="mt-3 text-sm text-muted-foreground">{bloc.source}</figcaption>}
              </figure>
            );

          case "note":
            return (
              <aside key={rang} className="rounded-xl border border-border bg-muted px-6 py-6">
                <p className="mesure leading-relaxed text-foreground">
                  <Marques segments={bloc.segments} />
                </p>
              </aside>
            );

          case "tableau":
            return (
              <div key={rang} className="overflow-x-auto rounded-xl border border-border bg-card">
                <table className="w-full min-w-[26rem] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-border">
                      {bloc.entetes.map((entete) => (
                        <th key={entete} scope="col" className="ecran-col">
                          {entete}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bloc.lignes.map((ligne, i) => (
                      <tr key={i} className="border-b border-border last:border-b-0">
                        {ligne.map((cellule, j) => (
                          <td
                            key={j}
                            className={
                              j === 0 ? "ecran-cellule font-medium text-foreground" : "ecran-cellule text-muted-foreground"
                            }
                          >
                            {cellule}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          case "code":
            return (
              <div key={rang} className="overflow-x-auto rounded-xl border border-border bg-muted px-4 py-4">
                <pre className="font-mono text-sm leading-relaxed text-foreground">
                  <code>{bloc.lignes.join("\n")}</code>
                </pre>
              </div>
            );
        }
      })}
    </div>
  );
}
