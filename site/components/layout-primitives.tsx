import { cn } from "@/lib/cn";

/**
 * LE CONTENEUR DU SITE — un seul, d'une seule largeur.
 *
 * Il y avait quatre largeurs au choix (`etroite`, `lisible`, `normale`,
 * `large`) et un second conteneur en CSS à 96rem : la barre de navigation
 * et le contenu n'avaient donc pas les mêmes marges, et on le voyait. Il
 * n'y a plus qu'une largeur, `--largeur-site`, déclarée dans
 * `app/globals.css` et partagée par la barre, le pied et le contenu.
 */
export function Container({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("gouttiere largeur-site mx-auto w-full", className)}>{children}</div>;
}

/** Une carte de contenu : le même fond, le même filet et le même rayon partout. */
export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn(
      "rounded-xl border border-border bg-card p-6 text-card-foreground transition-colors duration-200 ease-out hover:border-primary focus-within:border-primary",
      className
    )}>{children}</div>
  );
}

/**
 * UNE LISTE STRUCTURÉE — un intitulé en demi-gras, et sa précision.
 *
 * Elle remplace les listes à puces de contenu (2026-09-21). Une puce ne dit
 * rien : elle annonce qu'il y a une suite, et l'œil doit lire la ligne
 * entière pour savoir de quoi elle parle. Un intitulé se balaie ; on lit la
 * précision de celui qui nous concerne, et pas des six autres.
 *
 * C'est une liste de DÉFINITIONS, pas une liste à puces déguisée : le
 * balisage le dit aussi (`dl`, `dt`, `dd`).
 */
export function ListeStructuree({
  elements,
  colonnes = 1,
}: {
  elements: readonly { intitule: string; precision?: string }[];
  colonnes?: 1 | 2;
}) {
  return (
    <dl className={cn("grid gap-6", colonnes === 2 && "sm:grid-cols-2")}>
      {elements.map((element, rang) => (
        <div key={element.intitule} data-entree data-rang={rang}>
          <dt className="font-medium text-foreground">{element.intitule}</dt>
          {element.precision && (
            <dd className="mesure mt-2 text-sm leading-relaxed text-muted-foreground">{element.precision}</dd>
          )}
        </div>
      ))}
    </dl>
  );
}

/** La puce des listes en prose — un point, pas un caractère typographique qu'une synthèse vocale lirait. */
export function Puce() {
  return <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-muted-foreground" />;
}
