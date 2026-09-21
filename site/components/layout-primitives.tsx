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
      "rounded-xl border border-border bg-card p-6 text-card-foreground transition-colors duration-200 ease-out hover:border-primary",
      className
    )}>{children}</div>
  );
}

/** La puce des listes en prose — un point, pas un caractère typographique qu'une synthèse vocale lirait. */
export function Puce() {
  return <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-muted-foreground" />;
}
